import express, { type Request, type Response } from "express";

const app = express();
const PORT = process.env["PORT"] || 3000;

// Middleware for JSON parsing
app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.send("Hello from TypeScript Express!");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
