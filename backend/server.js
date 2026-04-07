const express = require("express");
const path = require("path");

const app = express();
const nodemailer = require("nodemailer");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "dwarakaprakash9412@gmail.com",
    pass: "hztf dojc bcyg vuds"
  }
});

let otpStore = {}; // store OTP temporarily

// ✅ Store users (temporary database)
let users = [];

// ✅ Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// ================= ROUTES =================

// 🔹 Default → Login page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

// 🔹 Register Page
app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/register.html"));
});

app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  if (!otpStore[email]) {
    return res.send("Session expired ❌");
  }

  if (otpStore[email].otp !== otp) {
    return res.send("Entered OTP is incorrect ❌");
  }

  // Save user after correct OTP
  users.push({
    name: otpStore[email].name,
    email,
    password: otpStore[email].password
  });

  delete otpStore[email];

  res.send("Registration successful 🎉 <br><a href='/'>Login</a>");
});

// 🔹 Handle Register


  app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  const userExists = users.find(u => u.email === email);
  if (userExists) {
    return res.send("User already exists ❌");
  }

  const otp = generateOTP();
  otpStore[email] = { otp, name, password };

  await transporter.sendMail({
    from: "YOUR_EMAIL@gmail.com",
    to: email,
    subject: "Your OTP",
    text: `Your OTP is ${otp}`
  });

  res.send(`
    OTP sent to email ✅
    <br><a href="/otp.html?email=${email}">Verify OTP</a>
  `);
});

// 🔹 Handle Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const user = users.find(
    u => u.email === email && u.password === password
  );

  if (!user) {
    return res.send("Invalid Credentials ❌");
  }

  res.redirect("/dashboard.html");
});

app.post("/upload", upload.single("file"), (req, res) => {
  res.send("File uploaded successfully ✅");
});
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ==========================================

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});