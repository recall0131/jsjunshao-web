const mysql = require('mysql2');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jsjunshao',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

// Promise wrapper
const query = (sql, params) =>
  new Promise((resolve, reject) => {
    db.execute(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

// Get a single row
const get = async (sql, params) => {
  const rows = await query(sql, params);
  return rows[0];
};

// Check connection
db.getConnection()
  .then(conn => {
    console.log('✅ MySQL connected:', conn.threadId);
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err.message);
  });

module.exports = { db, query, get };
