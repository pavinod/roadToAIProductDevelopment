const express = require('express');
const db = require('./database');
const app = express();
const port = 3000;

app.use(express.json());

const VALID_API_KEYS = new Set([
  'your-secret-key-123',
  'another-key-456'
]);

function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key is required' });
  }
  
  if (!VALID_API_KEYS.has(apiKey)) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  next();
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', database: 'connected' });
});

// ============= USER ENDPOINTS =============

// Get all users
app.get('/api/users', validateApiKey, (req, res) => {
  try {
    const users = db.prepare('SELECT * FROM users').all();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single user
app.get('/api/users/:id', validateApiKey, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new user
app.post('/api/users', validateApiKey, (req, res) => {
  try {
    const { name, email } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    
    const stmt = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
    const result = stmt.run(name, email);
    
    res.status(201).json({
      message: 'User created',
      user: { id: result.lastInsertRowid, name, email }
    });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Update user
app.put('/api/users/:id', validateApiKey, (req, res) => {
  try {
    const { name, email } = req.body;
    const stmt = db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?');
    const result = stmt.run(name, email, req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User updated', user: { id: req.params.id, name, email } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
app.delete('/api/users/:id', validateApiKey, (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= PRODUCT ENDPOINTS =============

// Get all products
app.get('/api/products', validateApiKey, (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products').all();
    res.json({ products });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new product
app.post('/api/products', validateApiKey, (req, res) => {
  try {
    const { name, price, stock } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }
    
    const stmt = db.prepare('INSERT INTO products (name, price, stock) VALUES (?, ?, ?)');
    const result = stmt.run(name, price, stock || 0);
    
    res.status(201).json({
      message: 'Product created',
      product: { id: result.lastInsertRowid, name, price, stock: stock || 0 }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`✓ Server running on http://localhost:${port}`);
  console.log(`✓ Database: myservice.db`);
  console.log(`✓ API Key: your-secret-key-123`);
});