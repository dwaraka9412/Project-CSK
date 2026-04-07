const express = require("express");
const path = require("path");

const app = express();

// ✅ Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// ✅ Test route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

// ✅ Login test
app.post("/login", (req, res) => {
  console.log(req.body);
  res.send("LOGIN WORKING ✅");
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});