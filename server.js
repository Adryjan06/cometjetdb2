const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const supabase = require('./supabaseClient');
const cors = require('cors');
const ejs = require('ejs');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const allowedOrigins = ['https://twoja-strona.com', 'http://localhost:3000', 'https://comet-jet-site.vercel.app'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Email sending function
async function sendEmail(to, subject, content, isHtml = false) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'hello.cometjet@gmail.com',
      pass: 'bmlidtluamybfyal'
    }
  });

  const mailOptions = {
    from: 'hello.cometjet@gmail.com',
    to,
    subject,
    [isHtml ? 'html' : 'text']: content
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Mail sent: " + info.response);
  } catch (err) {
    console.error("Error sending email:", err);
    throw err;
  }
}

// Endpoints
app.post('/api/submit', async (req, res) => {
  const { name, email, callsign, experience, reason, aircrafts } = req.body;
  const { data, error } = await supabase
    .from('submissions')
    .insert([{
      name,
      email,
      callsign,
      experience,
      reason,
      selected_aircrafts: aircrafts
    }]);

  if (error) {
    console.error('Supabase error in /api/submit:', error);
    return res.status(500).send("Błąd bazy danych");
  }

  await sendEmail(email, "Thank you for your application!", "Your application has been accepted. We will get back to you within 3 days.");
  res.sendStatus(200);
});

app.get('/api/applications', async (req, res) => {
  try {
    console.log('Fetching applications from Supabase...');
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error in /api/applications:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }
    console.log('Applications fetched:', data);
    res.json(data);
  } catch (err) {
    console.error('Server error in /api/applications:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/posts', async (req, res) => {
  try {
    console.log('Fetching posts from Supabase...');
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error in /api/posts:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }
    console.log('Posts fetched:', data);
    res.json(data);
  } catch (err) {
    console.error('Server error in /api/posts:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/admin', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error in /admin:', error);
      return res.status(500).send('Błąd bazy danych');
    }

    res.render('admin', { applications: data || [] });
  } catch (err) {
    console.error('Błąd serwera w /admin:', err);
    res.status(500).send('Wewnętrzny błąd serwera');
  }
});

app.post('/api/action', async (req, res) => {
  const { id, action } = req.body;
  console.log('Dane wejściowe:', { id, action });

  if (!id || !['accept', 'reject'].includes(action)) {
    console.error('Nieprawidłowe dane wejściowe:', { id, action });
    return res.status(400).send('Nieprawidłowe ID lub akcja');
  }

  const { data, error } = await supabase.from('submissions').select('*').eq('id', id).single();
  if (error || !data) {
    console.error('Błąd pobierania zgłoszenia:', error);
    return res.status(404).send('Zgłoszenie nie znalezione');
  }

  if (data.status === 'accept' || data.status === 'reject') {
    console.log(`Zgłoszenie ${id} już ma status: ${data.status}`);
    return res.redirect('/admin');
  }

  try {
    if (action === 'accept') {
      if (!data.selected_aircraft_letters || !data.callsign) {
        throw new Error('Brak selected_aircraft_letters lub callsign');
      }
      const aircrafts = generateAircraftRegistrations(data.selected_aircraft_letters, data.callsign);
      const API_BASE = process.env.API_BASE || 'https://cometjetdb2.onrender.com';

      const response = await fetch(`${API_BASE}/pilots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          callsign: data.callsign,
          aircrafts
        })
      });
      if (!response.ok) {
        throw new Error(`Błąd żądania do /api/pilots: ${response.statusText}`);
      }

      const emailContent = await ejs.renderFile(
        path.join(__dirname, 'views', 'email-template.ejs'),
        { name: data.name }
      );
      await sendEmail(data.email, 'Welcome to CometJet!', emailContent, true);
    } else {
      const rejectionMessage = `...`; // Wiadomość odrzucenia
      await sendEmail(data.email, 'CometJet - Recruitment Outcome Notification', rejectionMessage);
    }

    const { error: updateError } = await supabase.from('submissions').update({ status: action }).eq('id', id);
    if (updateError) {
      throw new Error(`Błąd aktualizacji statusu: ${updateError.message}`);
    }

    res.redirect('/admin');
  } catch (err) {
    console.error('Błąd w /api/action:', err.message, err.stack);
    res.status(500).send('Błąd przetwarzania akcji');
  }
});

async function sendWelcomeEmail(email, tempPassword) {
  const content = `
    <h1>Witaj w CometJet!</h1>
    <p>Twoje konto pilota zostało utworzone</p>
    <p>Login: ${email}</p>
    <p>Tymczasowe hasło: <strong>${tempPassword}</strong></p>
    <p>Zaloguj się i zmień hasło: <a href="https://cometjet.com/login">https://cometjet.com/login</a></p>
  `;
  
  await sendEmail(email, "Witaj w CometJet Airlines!", content, true);
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

app.post('/api/send-email', async (req, res) => {
  const { to, subject, message } = req.body;
  if (!to || !subject || !message) {
    return res.status(400).json({ error: 'Brak wymaganych pól: to, subject, message' });
  }

  try {
    await sendEmail(to, subject, message);
    res.status(200).json({ message: 'Email wysłany' });
  } catch (error) {
    console.error('Błąd wysyłania emaila:', error);
    res.status(500).json({ error: 'Błąd wysyłania emaila' });
  }
});

app.get('/api/posts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.json(data);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/api/posts', async (req, res) => {
  const { id, title, content, author, image_url, is_published } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required" });
  }

  const postData = {
    title,
    content,
    author: author || "Admin",
    image_url: image_url || null,
    is_published: is_published || false,
    updated_at: new Date().toISOString()
  };

  try {
    let data;
    if (id) {
      const { data: updated, error } = await supabase
        .from('posts')
        .update(postData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      data = updated;
    } else {
      const { data: created, error } = await supabase
        .from('posts')
        .insert([postData])
        .select()
        .single();
      if (error) throw error;
      data = created;
    }
    res.status(200).json(data);
  } catch (error) {
    console.error('Błąd bazy danych:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/posts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.status(200).json({ message: "Post deleted" });
  } catch (error) {
    console.error('Błąd bazy danych:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint
app.get('/debug', async (req, res) => {
  const fs = require('fs');
  const filePath = path.join(__dirname, 'views', 'admin.ejs');
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      res.send('Błąd Supabase: ' + error.message);
    } else {
      res.send(`Plik admin.ejs istnieje: ${fs.existsSync(filePath) ? 'Tak' : 'Nie'}<br>Dane z Supabase: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    res.send('Błąd serwera: ' + err.message);
  }
});

app.listen(PORT, () => console.log(`Serwer działa na http://localhost:${PORT}`));


// Tworzenie konta pilota
app.post('/api/pilots', async (req, res) => {
  const { name, email, callsign, aircrafts } = req.body;
  const tempPassword = generatePassword(); // funkcja generująca hasło

  const { data, error } = await supabase
    .from('pilots')
    .insert([{
      name,
      email,
      callsign,
      password: tempPassword,
      aircrafts,
      role: 'pilot'
    }]);

  // Wyślij email z danymi logowania
  await sendWelcomeEmail(email, tempPassword);

  res.status(201).json(data);
});

// Pobieranie listy pilotów
app.get('/api/pilots', async (req, res) => {
  const { data, error } = await supabase
    .from('pilots')
    .select('*');

  res.json(data);
});


app.put('/api/pilots/:id', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  
  const { data, error } = await supabase
    .from('pilots')
    .update({ role })
    .eq('id', id);
  
  res.json(data);
});
