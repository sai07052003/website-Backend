// src/config/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Mysql@1249",
  database: process.env.DB_NAME || "techlynxproject2",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;