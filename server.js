const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const supabase = require('./supabaseClient');

const cors = require('cors');

// Zezwól na żądania z Twojej domeny frontendu
const allowedOrigins = [
  'https://twoja-strona.com',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Zezwól na żądania bez origin (np. Postman)
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

const app = express();
const cors = require('cors');
app.use(cors());
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.post('/api/submit', async (req, res) => {
  const { name, email, callsign, experience, reason } = req.body;
  const { data, error } = await supabase
    .from('submissions')
    .insert([{ name, email, callsign, experience, reason }]);

  if (error) return res.status(500).send("Błąd bazy danych");

  sendEmail(email, "Dziękujemy za zgłoszenie", "Twoja aplikacja została przyjęta. Odezwiemy się w ciągu 3 dni.");
  res.sendStatus(200);
});

app.get('/admin', async (req, res) => {
  const { data, error } = await supabase.from('submissions').select('*').order('created_at', { ascending: false });
  if (error) return res.send("Błąd bazy danych");
  res.render("admin", { submissions: data });
});

app.post('/api/action', async (req, res) => {
  const { id, action } = req.body;
  const { data, error } = await supabase.from('submissions').select('*').eq('id', id).single();
  if (!data || error) return res.redirect('/admin');

  let subject = "", msg = "";
  if (action === "accept") {
    subject = "Gratulacje!";
    msg = "Zostałeś przyjęty do CometJet Virtual Airlines.";
  } else {
    subject = "Dziękujemy za zgłoszenie";
    msg = "Niestety nie zakwalifikowałeś się.";
  }

  sendEmail(data.email, subject, msg);
  await supabase.from('submissions').update({ status: action }).eq('id', id);
  res.redirect('/admin');
});

function sendEmail(to, subject, text) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'jch29jc@gmail.com',
      pass: 'dtmuyqcnyquwmfgp'
    }
  });
  transporter.sendMail({ from: 'jch29jc@gmail.com', to, subject, text }, (err, info) => {
    if (err) console.error(err);
    else console.log("Mail wysłany: " + info.response);
  });
}

app.listen(PORT, () => console.log(`Serwer działa na http://localhost:${PORT}`));

app.get('/api/applications', async (req, res) => {
  const { data, error } = await supabase.from('submissions').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: "Błąd bazy danych" });
  res.json(data);
});

app.post('/api/send-email', async (req, res) => {
  const { to, subject, message } = req.body;

  if (!to || !subject || !message) {
    return res.status(400).json({ error: 'Brak wymaganych pól: to, subject, message' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'jch29jc@gmail.com',         // Twój email
        pass: 'dtmuyqcnyquwmfgp'           // Hasło aplikacji lub token SMTP
      }
    });

    await transporter.sendMail({
      from: 'jch29jc@gmail.com',
      to,
      subject,
      text: message
    });

    res.status(200).json({ message: 'Email wysłany' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd podczas wysyłania maila' });
  }
});

// server.js - dodaj te endpointy

// Pobierz wszystkie posty (dla strony blog)
app.get('/api/posts', async (req, res) => {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: "Database error" });
  res.json(data);
});

// Pobierz pojedynczy post (dla strony szczegółów)
app.get('/api/posts/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return res.status(404).json({ error: "Post not found" });
  res.json(data);
});

// Utwórz/edytuj post (tylko dla admina)
app.post('/api/posts', async (req, res) => {
  const { id, title, content, author, image_url, is_published } = req.body;
  
  // Walidacja
  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required" });
  }

  const postData = {
    title,
    content,
    author: author || "Admin",
    image_url,
    is_published: is_published || false,
    updated_at: new Date().toISOString()
  };

  try {
    let data;
    if (id) {
      // Edycja istniejącego posta
      const { data: updated, error } = await supabase
        .from('posts')
        .update(postData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      data = updated;
    } else {
      // Nowy post
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
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

// Usuń post (tylko dla admina)
app.delete('/api/posts/:id', async (req, res) => {
  const { id } = req.params;
  
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: "Database error" });
  res.status(200).json({ message: "Post deleted" });
});

app.get('/api/posts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(data);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Pobierz pojedynczy post
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

// Utwórz/edytuj post (tylko dla admina)
app.post('/api/posts', async (req, res) => {
  const { id, title, content, author, image_url, is_published } = req.body;
  
  // Walidacja
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
      // Aktualizacja istniejącego posta
      const { data: updated, error } = await supabase
        .from('posts')
        .update(postData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      data = updated;
    } else {
      // Nowy post
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
    console.error('Database error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Usuń post (tylko dla admina)
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
    console.error('Database error:', error);
    res.status(500).json({ error: error.message });
  }
});
