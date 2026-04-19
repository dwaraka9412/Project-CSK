const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const fs = require("fs");
require("dotenv").config();
const crypto = require("crypto");

const algorithm = "aes-256-cbc";
const key = crypto.createHash("sha256").update("my_secret_key").digest();
const iv = Buffer.alloc(16, 0); // initialization vector

function encryptFile(buffer) {
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  return Buffer.concat([cipher.update(buffer), cipher.final()]);
}


function decryptFile(buffer) {
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  return Buffer.concat([decipher.update(buffer), decipher.final()]);
}


// 🔥 For download fix
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const app = express();
let otpStore = {};

// ================= MONGODB =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.log(err));

// ================= SCHEMA =================
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  files: [
    {
      name: String,
      url: String,
      public_id: String,
      resource_type: String
    }
  ]
});

const User = mongoose.model("User", userSchema);

// ================= EMAIL =================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ================= CLOUDINARY =================
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET
});

// ================= MULTER =================
const upload = multer({ dest: "uploads/" });

// ================= MIDDLEWARE =================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// ================= ROUTES =================

// 🔹 Home
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

// 🔹 Register Page
app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/register.html"));
});

// 🔹 GET FILES
app.get("/files/:email", async (req, res) => {
  let email = req.params.email.trim().toLowerCase();

  const user = await User.findOne({ email });
  if (!user) return res.json([]);

  res.json(user.files || []);
});

// 🔹 LOGIN
app.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send("All fields required ❌");
    }

    email = email.trim().toLowerCase();

    const user = await User.findOne({ email });
    if (!user) return res.status(404).send("User not found ❌");

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).send("Wrong password ❌");

    const otp = Math.floor(100000 + Math.random() * 900000);

    otpStore[email] = {
      otp,
      expires: Date.now() + 5 * 60 * 1000
    };

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP is ${otp}`
    });

    res.redirect(`/otp.html?email=${email}&type=login`);

  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong ❌");
  }
});

// 🔹 VERIFY OTP
app.post("/verify-otp", (req, res) => {
  let { email, otp } = req.body;

  email = email.trim().toLowerCase();
  otp = Number(otp);

  const record = otpStore[email];

  if (!record) return res.status(400).send("OTP expired ❌");
  if (record.otp !== otp) return res.status(400).send("Invalid OTP ❌");
  if (Date.now() > record.expires) return res.status(400).send("OTP expired ❌");

  delete otpStore[email];

  res.redirect(`/dashboard.html?email=${email}`);
});

// 🔹 REGISTER
app.post("/register", async (req, res) => {
  try {
    let { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).send("All fields required ❌");
    }

    email = email.trim().toLowerCase();

    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).send("User already exists ❌");

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email,
      password: hashedPassword,
      files: []
    });

    res.send("Registration successful ✅ <br><a href='/'>Login</a>");

  } catch (err) {
    console.error(err);
    res.status(500).send("Registration failed ❌");
  }
});

// 🔹 FILE UPLOAD
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No file selected ❌");

    let email = req.body.email.trim().toLowerCase();

    // 📥 Read original file
    const fileBuffer = fs.readFileSync(req.file.path);

    // 🔐 Encrypt file
    const encryptedBuffer = encryptFile(fileBuffer);

    // 💾 Save encrypted temp file
    const tempPath = "encrypted.tmp";
    fs.writeFileSync(tempPath, encryptedBuffer);

    // ☁️ Upload encrypted file to Cloudinary
    const result = await cloudinary.uploader.upload(tempPath, {
      resource_type: "raw",
      use_filename: true,
      unique_filename: false
    });

    // 🧹 Cleanup temp files
    fs.unlinkSync(req.file.path);
    fs.unlinkSync(tempPath);

    // 💾 Save metadata in DB
    await User.updateOne(
      { email },
      {
        $push: {
          files: {
            name: req.file.originalname,
            url: result.secure_url,
            public_id: result.public_id,
            resource_type: "raw"
          }
        }
      }
    );

    res.redirect(`/dashboard.html?email=${email}`);

  } catch (err) {
    console.error(err);
    res.status(500).send("Upload failed ❌");
  }
});

// 🔹 DOWNLOAD (FINAL FIX 🔥)
app.get("/download", async (req, res) => {
  try {
    const { url, name } = req.query;

    if (!url || !name) {
      return res.status(400).send("Invalid request ❌");
    }

    // 📥 Fetch encrypted file
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    // 🔓 Decrypt
    const decryptedData = decryptFile(Buffer.from(buffer));

    // 🧠 Detect file type
    const ext = name.split(".").pop().toLowerCase();

    let contentType = "application/octet-stream";
    if (ext === "pdf") contentType = "application/pdf";
    else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
    else if (ext === "png") contentType = "image/png";
    else if (ext === "txt") contentType = "text/plain";

    // ⬇️ FORCE DOWNLOAD
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.setHeader("Content-Type", contentType);

    res.send(decryptedData);

  } catch (err) {
    console.error(err);
    res.status(500).send("Download failed ❌");
  }
});
app.get("/view", async (req, res) => {
  try {
    const { url, name } = req.query;

    if (!url || !name) {
      return res.status(400).send("Invalid request ❌");
    }

    // 📥 Fetch encrypted file
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    // 🔓 Decrypt
    const decryptedData = decryptFile(Buffer.from(buffer));

    // 🧠 Detect file type
    const ext = name.split(".").pop().toLowerCase();

    let contentType = "application/octet-stream";
    if (ext === "pdf") contentType = "application/pdf";
    else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
    else if (ext === "png") contentType = "image/png";
    else if (ext === "txt") contentType = "text/plain";

    // 👁️ INLINE VIEW
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Content-Type", contentType);

    res.send(decryptedData);

  } catch (err) {
    console.error(err);
    res.status(500).send("View failed ❌");
  }
});
// 🔹 DELETE FILE
app.delete("/delete-file", async (req, res) => {
  const { email, public_id, resource_type } = req.body;

  if (!email || !public_id) {
    return res.status(400).send("Invalid request ❌");
  }

  try {
    await cloudinary.uploader.destroy(public_id, {
      resource_type: resource_type || "raw"
    });

    await User.updateOne(
      { email },
      { $pull: { files: { public_id } } }
    );

    res.send("File deleted ✅");

  } catch (err) {
    res.status(500).send("Error deleting file ❌");
  }
});

// ================= SERVER =================
app.listen(3000, () => {
  console.log("Server running 🚀 http://localhost:3000");
});