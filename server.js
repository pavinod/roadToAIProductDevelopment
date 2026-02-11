const express = require('express');
const db = require('./database');
const logger = require('./logger');
const { apiLimiter, createLimiter, authLimiter, createApiKeyLimiter } = require('./rateLimiter');
const {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  errorHandler,
  asyncHandler
} = require('./errorHandler');

const app = express();
const port = 3000;

app.use(express.json());

// Trust proxy (important for rate limiting by IP)
app.set('trust proxy', 1);

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    query: req.query,
    apiKey: req.headers['x-api-key'] ? '***' : 'none'
  });
  next();
});

// Apply general rate limiter to all API routes
app.use('/api/', apiLimiter);

// Per-API-key limiter - 1000 requests per hour per key
const perKeyLimiter = createApiKeyLimiter(1000, 60);
app.use('/api/', perKeyLimiter);

const VALID_API_KEYS = new Set([
  'your-secret-key-123',
  'another-key-456'
]);

// API Key validation middleware with auth rate limiting
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    throw new UnauthorizedError('API key is required');
  }
  
  if (!VALID_API_KEYS.has(apiKey)) {
    // Apply auth limiter for failed auth attempts
    return authLimiter(req, res, () => {
      throw new ForbiddenError('Invalid API key');
    });
  }
  
  next();
}

// Health check - no rate limit
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    database: 'connected',
    timestamp: new Date().toISOString()
  });
});

// ============= USER ENDPOINTS =============

// Get all users
app.get('/api/users', validateApiKey, asyncHandler(async (req, res) => {
  const users = db.prepare('SELECT * FROM users').all();
  logger.success('Retrieved all users', { count: users.length });
  res.json({ users, count: users.length });
}));

// Get single user
app.get('/api/users/:id', validateApiKey, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (isNaN(id)) {
    throw new ValidationError('User ID must be a number');
  }
  
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  
  if (!user) {
    throw new NotFoundError(`User with ID ${id} not found`);
  }
  
  logger.success('Retrieved user', { userId: id });
  res.json({ user });
}));

// Create new user - with stricter rate limit
app.post('/api/users', createLimiter, validateApiKey, asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  
  if (!name || !email) {
    throw new ValidationError('Name and email are required');
  }
  
  if (!email.includes('@')) {
    throw new ValidationError('Invalid email format');
  }
  
  if (name.length < 2) {
    throw new ValidationError('Name must be at least 2 characters');
  }
  
  try {
    const stmt = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
    const result = stmt.run(name, email);
    
    const newUser = { id: result.lastInsertRowid, name, email };
    logger.success('User created', { userId: newUser.id });
    
    res.status(201).json({
      message: 'User created successfully',
      user: newUser
    });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      throw new ValidationError(`Email '${email}' already exists`);
    }
    throw error;
  }
}));

// Update user
app.put('/api/users/:id', validateApiKey, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;
  
  if (isNaN(id)) {
    throw new ValidationError('User ID must be a number');
  }
  
  if (!name || !email) {
    throw new ValidationError('Name and email are required');
  }
  
  if (!email.includes('@')) {
    throw new ValidationError('Invalid email format');
  }
  
  try {
    const stmt = db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?');
    const result = stmt.run(name, email, id);
    
    if (result.changes === 0) {
      throw new NotFoundError(`User with ID ${id} not found`);
    }
    
    logger.success('User updated', { userId: id });
    res.json({ 
      message: 'User updated successfully', 
      user: { id, name, email } 
    });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      throw new ValidationError(`Email '${email}' already exists`);
    }
    throw error;
  }
}));

// Delete user
app.delete('/api/users/:id', validateApiKey, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (isNaN(id)) {
    throw new ValidationError('User ID must be a number');
  }
  
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  const result = stmt.run(id);
  
  if (result.changes === 0) {
    throw new NotFoundError(`User with ID ${id} not found`);
  }
  
  logger.success('User deleted', { userId: id });
  res.json({ message: 'User deleted successfully' });
}));

// ============= PRODUCT ENDPOINTS =============

// Get all products
app.get('/api/products', validateApiKey, asyncHandler(async (req, res) => {
  const products = db.prepare('SELECT * FROM products').all();
  logger.success('Retrieved all products', { count: products.length });
  res.json({ products, count: products.length });
}));

// Create new product - with stricter rate limit
app.post('/api/products', createLimiter, validateApiKey, asyncHandler(async (req, res) => {
  const { name, price, stock } = req.body;
  
  if (!name || price === undefined) {
    throw new ValidationError('Name and price are required');
  }
  
  if (price < 0) {
    throw new ValidationError('Price cannot be negative');
  }
  
  if (stock !== undefined && stock < 0) {
    throw new ValidationError('Stock cannot be negative');
  }
  
  const stmt = db.prepare('INSERT INTO products (name, price, stock) VALUES (?, ?, ?)');
  const result = stmt.run(name, price, stock || 0);
  
  const newProduct = { id: result.lastInsertRowid, name, price, stock: stock || 0 };
  logger.success('Product created', { productId: newProduct.id });
  
  res.status(201).json({
    message: 'Product created successfully',
    product: newProduct
  });
}));

// 404 handler
app.use((req, res) => {
  throw new NotFoundError(`Endpoint ${req.method} ${req.path} not found`);
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Server shutting down gracefully...');
  db.close();
  process.exit(0);
});

app.listen(port, () => {
  logger.success(`Server running on http://localhost:${port}`);
  logger.info(`Database: myservice.db`);
  logger.info(`Rate limits active`);
  logger.info(`  - General API: 100 req/15min per IP`);
  logger.info(`  - Per API key: 1000 req/hour`);
  logger.info(`  - Create operations: 10 req/hour`);
  logger.info(`  - Auth failures: 5 attempts/15min`);
});