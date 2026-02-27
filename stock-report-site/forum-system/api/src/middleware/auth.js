import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role_code, email: user.email }, config.jwtSecret, { expiresIn: '1h' });
}

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
