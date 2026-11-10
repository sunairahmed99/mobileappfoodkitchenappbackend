// Runs before each test file is loaded (before app.js / dotenv.config()).
// dotenv does NOT override variables that already exist in process.env,
// so this deterministic secret is the one used by both the JWT middleware
// and User.generateAuthToken() during tests. No real secret is ever read.
process.env.NODE_ENV = 'test';
process.env.jwttoken = 'test-jwt-secret-do-not-use-in-production';
