const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const supabase = require('./supabaseClient');
const cors = require('cors');
const ejs = require('ejs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://cometjetdb2.onrender.com',
      'http://localhost:3000',
      'https://comet-jet-site.vercel.app'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Utility functions
function generateTempPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateRandomCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: 2 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

// Email sending function
async function sendEmail(to, subject, content, isHtml = false) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to,
    subject,
    [isHtml ? 'html' : 'text']: content
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}: ${info.response}`);
    return { success: true, response: info.response };
  } catch (err) {
    console.error(`Failed to send email to ${to}:`, err);
    throw new Error(`Failed to send email: ${err.message}`);
  }
}

// JWT Middleware
const verifyToken = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Brak tokenu, zaloguj się' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    return res.status(401).json({ error: 'Nieprawidłowy lub wygasły token', details: err.message });
  }
};

const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Brak uprawnień administratora' });
  }
  next();
};

// Aircraft registration mapping
const aircraftRegistrationMap = {
  'Airbus A320neo IniBuilds': 'J',
  'Airbus A320 Fenix': 'F',
  'Airbus A320 FlyByWire': 'F',
  'Airbus A321neo IniBuilds': 'O',
  'Airbus A330neo': 'X',
  'Airbus A350': 'A',
  'Airbus A380 FlyByWire': 'V',
  'Boeing 737': 'N',
  'Boeing 737 MAX': 'M',
  'Boeing 787': 'D',
  'Boeing 777-300ER': 'P',
  'Embraer E175': 'E'
};

// Routes
app.put('/api/applications/:id/status', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  console.log(`Processing application ${id} with status ${status}`);

  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (!data || error) {
      console.error('Application fetch failed:', error);
      return res.status(404).json({ error: 'Application not found' });
    }

    if (status === "accept") {
      const registrationCode = generateRandomCode();
      const tempPassword = generateTempPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const { data: newPilot, error: pilotError } = await supabase
        .from('pilots')
        .insert([{
          email: data.email,
          name: data.name,
          password: hashedPassword,
          first_login: true,
          role: 'user',
          registration_code: registrationCode
        }])
        .select('id')
        .single();

      if (pilotError) {
        console.error('Error creating pilot:', pilotError);
        return res.status(500).json({ error: 'Error creating pilot account', details: pilotError.message });
      }

      const { error: updateError } = await supabase
        .from('submissions')
        .update({
          status: 'accept',
          pilot_id: newPilot.id
        })
        .eq('id', id);

      if (updateError) {
        console.error('Error updating application:', updateError);
        return res.status(500).json({ error: 'Error updating application', details: updateError.message });
      }

      const emailContent = `Witaj w CometJet!
      
      Twoje konto pilot zostało utworzone.
      Dane logowania:
      Email: ${data.email}
      Tymczasowe hasło: ${tempPassword}
      
      Zaloguj się i zmień hasło po pierwszym logowaniu.`;

      try {
        await sendEmail(data.email, "Witamy w CometJet!", emailContent);
      } catch (emailErr) {
        console.error('Email sending failed:', emailErr);
        return res.status(500).json({ error: 'Application accepted but email sending failed', details: emailErr.message });
      }

      res.status(200).json({ message: 'Application accepted' });

    } else if (status === "reject") {
      const { error: updateError } = await supabase
        .from('submissions')
        .update({
          status: 'reject',
          rejection_reason: req.body.reason || 'Odrzucono przez administratora'
        })
        .eq('id', id);

      if (updateError) {
        console.error('Error updating application:', updateError);
        return res.status(500).json({ error: 'Error updating application', details: updateError.message });
      }

      const rejectionMsg = `Twoje zgłoszenie do CometJet zostało odrzucone.`;
      try {
        await sendEmail(data.email, "Status zgłoszenia CometJet", rejectionMsg);
      } catch (emailErr) {
        console.error('Email sending failed:', emailErr);
        return res.status(500).json({ error: 'Application rejected but email sending failed', details: emailErr.message });
      }

      res.status(200).json({ message: 'Application rejected' });
    } else {
      return res.status(400).json({ error: 'Invalid status' });
    }
  } catch (err) {
    console.error(`Error processing application ${id}:`, err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.get('/api/fleet-stats', async (req, res) => {
  try {
    const { data: pilots, error } = await supabase
      .from('pilots')
      .select('registrations');

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }

    const modelCounts = {};
    pilots.forEach(pilot => {
      if (pilot.registrations && typeof pilot.registrations === 'object') {
        Object.keys(pilot.registrations).forEach(model => {
          modelCounts[model] = (modelCounts[model] || 0) + 1;
        });
      }
    });

    const allModels = [
      "Airbus A320neo IniBuilds",
      "Airbus A320 Fenix",
      "Airbus A321neo IniBuilds",
      "Airbus A330neo",
      "Airbus A350",
      "Airbus A380 FlyByWire",
      "Boeing 737-800",
      "Boeing 737 MAX",
      "Boeing 787",
      "Boeing 777-300ER",
      "Embraer E175"
    ];

    allModels.forEach(model => {
      if (!modelCounts.hasOwnProperty(model)) {
        modelCounts[model] = 0;
      }
    });

    res.json(modelCounts);
  } catch (err) {
    console.error('Error fetching fleet stats:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase
      .from('pilots')
      .select('id, password, first_login, role, name')
      .eq('email', email)
      .single();

    if (error || !data) {
      console.error('Login failed: Invalid email', email);
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
    }

    const isMatch = await bcrypt.compare(password, data.password);
    if (!isMatch) {
      console.error('Login failed: Invalid password for', email);
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
    }

    const token = jwt.sign(
      { pilotId: data.id, role: data.role, name: data.name },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.status(200).json({ message: 'Logowanie pomyślne', token, firstLogin: data.first_login, pilotId: data.id, role: data.role, name: data.name });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Błąd serwera', details: err.message });
  }
});

app.get('/api/pilot/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.pilotId !== id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Brak uprawnień do tych danych' });
    }
    const { data, error } = await supabase
      .from('pilots')
      .select('id, name, email, role, registrations, registration_code')
      .eq('id', id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error(`Error fetching pilot ${req.params.id}:`, error);
    res.status(500).json({ error: 'Błąd pobierania danych pilota', details: error.message });
  }
});

app.post('/api/submit', async (req, res) => {
  const {
    name,
    email,
    discord,
    callsign,
    birth_date,
    continent,
    icao,
    interest_duration,
    simulator,
    networks,
    flight_types,
    other_airlines,
    source,
    aircrafts,
    experience,
    reason
  } = req.body;

  try {
    const requiredFields = { name, email, callsign, birth_date, continent, experience, reason };
    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        return res.status(400).json({ error: `Pole ${key} jest wymagane` });
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Nieprawidłowy format emaila' });
    }

    const birthDate = new Date(birth_date);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age < 13) {
      return res.status(400).json({ error: 'Musisz mieć co najmniej 13 lat, aby złożyć aplikację' });
    }

    if (icao && !/^[A-Z]{4}$/.test(icao)) {
      return res.status(400).json({ error: 'Nieprawidłowy kod ICAO' });
    }

    const aircraftsArray = Array.isArray(aircrafts)
      ? aircrafts
      : typeof aircrafts === 'string'
        ? aircrafts.split(',').map(s => s.trim())
        : [];
    if (aircraftsArray.length === 0 || aircraftsArray.length > 3) {
      return res.status(400).json({ error: 'Wybierz od 1 do 3 samolotów' });
    }

    const networksArray = Array.isArray(networks)
      ? networks
      : typeof networks === 'string'
        ? networks.split(',').map(s => s.trim())
        : [];

    const { data, error } = await supabase
      .from('submissions')
      .insert([{
        name,
        email,
        discord,
        callsign,
        birth_date,
        continent,
        icao,
        interest_duration,
        simulator,
        networks: networksArray,
        flight_types,
        other_airlines,
        source,
        selected_aircrafts: aircraftsArray,
        experience,
        reason,
        status: 'pending',
        created_at: new Date().toISOString(),
        registrations: {}
      }]);

    if (error) {
      console.error('Error inserting submission:', error);
      return res.status(500).json({ error: 'Błąd bazy danych', details: error.message });
    }

    try {
      await sendEmail(email, "Dziękujemy za zgłoszenie!", "Twoje zgłoszenie zostało przyjęte. Odezwiemy się w ciągu 3 dni.");
    } catch (emailErr) {
      console.error('Email sending failed for submission:', emailErr);
      return res.status(500).json({ error: 'Submission successful but email sending failed', details: emailErr.message });
    }
    res.status(200).json({ message: 'Zgłoszenie przesłane pomyślnie' });
  } catch (err) {
    console.error('Error submitting application:', err);
    res.status(500).json({ error: 'Błąd serwera', details: err.message });
  }
});

app.get('/api/applications', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching applications:', error);
      return res.status(500).json({ error: 'Błąd bazy danych', details: error.message });
    }
    res.json(data);
  } catch (err) {
    console.error('Error in /api/applications:', err);
    res.status(500).json({ error: 'Błąd serwera', details: err.message });
  }
});

app.get('/api/pilots', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pilots')
      .select('id, name, email, registrations, role, registration_code')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pilots:', error);
      return res.status(500).json({ error: 'Błąd bazy danych', details: error.message });
    }
    res.json(data);
  } catch (err) {
    console.error('Error in /api/pilots:', err);
    res.status(500).json({ error: 'Błąd serwera', details: err.message });
  }
});

app.get('/api/posts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching posts:', error);
      return res.status(500).json({ error: 'Błąd bazy danych', details: error.message });
    }
    res.json(data);
  } catch (err) {
    console.error('Error in /api/posts:', err);
    res.status(500).json({ error: 'Błąd serwera', details: err.message });
  }
});

app.get('/admin', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { data: applications, error: appError } = await supabase
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (appError) {
      console.error('Error fetching applications for admin:', appError);
      return res.status(500).send('Błąd bazy danych');
    }

    res.render('admin', { applications: applications || [] });
  } catch (err) {
    console.error('Error rendering admin page:', err);
    res.status(500).send('Wewnętrzny błąd serwera');
  }
});

app.post('/api/update-pilot', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const {
      id,
      name,
      email,
      role,
      registration_code,
      country,
      preferred_airport,
      preferred_aircraft,
      experience,
      birthdate,
      about,
      avatar
    } = req.body;

    const updateData = {
      name,
      email,
      role,
      registration_code,
      country,
      preferred_airport,
      preferred_aircraft,
      experience,
      birthdate,
      about,
      avatar
    };

    const { data, error } = await supabase
      .from('pilots')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating pilot:', error);
      throw error;
    }
    res.json(data);
  } catch (error) {
    console.error('Error in /api/update-pilot:', error);
    res.status(500).json({ error: 'Błąd aktualizacji pilota', details: error.message });
  }
});

app.post('/api/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const pilotId = req.user.pilotId;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Aktualne i nowe hasło są wymagane' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Nowe hasło musi mieć co najmniej 8 znaków' });
    }

    const { data: pilot, error: fetchError } = await supabase
      .from('pilots')
      .select('id, email, password, first_login')
      .eq('id', pilotId)
      .single();

    if (fetchError || !pilot) {
      console.error('Error fetching pilot for password change:', fetchError);
      return res.status(404).json({ error: 'Pilot nie znaleziony', details: fetchError?.message });
    }

    if (!pilot.first_login) {
      const validPassword = await bcrypt.compare(currentPassword, pilot.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Nieprawidłowe aktualne hasło' });
      }
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    const { data: updatedPilot, error: updateError } = await supabase
      .from('pilots')
      .update({ password: hashedNewPassword, first_login: false })
      .eq('id', pilotId)
      .select('id, email, first_login')
      .single();

    if (updateError) {
      console.error('Error updating password:', updateError);
      return res.status(500).json({ error: 'Błąd aktualizacji hasła', details: updateError.message });
    }

    try {
      await sendEmail(
        pilot.email,
        'Potwierdzenie zmiany hasła - CometJet',
        `Twoje hasło w systemie CometJet zostało pomyślnie zmienione.`,
        false
      );
    } catch (emailErr) {
      console.error('Email sending failed for password change:', emailErr);
    }

    return res.status(200).json({ message: 'Hasło zmienione pomyślnie', updatedPilot: { id: updatedPilot.id, first_login: updatedPilot.first_login } });
  } catch (error) {
    console.error('Error in /api/change-password:', error);
    return res.status(500).json({ error: 'Błąd serwera', details: error.message });
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
      console.error('Post not found:', id, error);
      return res.status(404).json({ error: 'Post nie znaleziony' });
    }
    res.json(data);
  } catch (err) {
    console.error('Error in /api/posts/:id:', err);
    res.status(500).json({ error: 'Błąd serwera', details: err.message });
  }
});

app.post('/api/posts', verifyToken, verifyAdmin, async (req, res) => {
  const { id, title, content, author, image_url, is_published } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Tytuł i treść są wymagane' });
  }

  const postData = {
    title,
    content,
    author: author || 'Admin',
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
  } catch (err) {
    console.error('Error in /api/posts:', err);
    res.status(500).json({ error: 'Błąd bazy danych', details: err.message });
  }
});

app.delete('/api/posts/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.status(200).json({ message: 'Post usunięty' });
  } catch (err) {
    console.error('Error deleting post:', err);
    res.status(500).json({ error: 'Błąd bazy danych', details: err.message });
  }
});

app.post('/api/send-email', verifyToken, verifyAdmin, async (req, res) => {
  const { to, subject, message } = req.body;
  try {
    await sendEmail(to, subject, message);
    res.status(200).json({ message: 'Email wysłany pomyślnie' });
  } catch (err) {
    console.error('Error in /api/send-email:', err);
    res.status(500).json({ error: 'Błąd wysyłania emaila', details: err.message });
  }
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/pilot-dashboard', verifyToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pilot-dashboard.html'));
});

app.get('/panel-admin', verifyToken, verifyAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'panel-admin.html'));
});

app.get('/api/keepalive', (req, res) => {
  res.send('OK');
});

app.get('/api/applications/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error('Application not found:', id, error);
      return res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    }
    res.json(data);
  } catch (err) {
    console.error('Error in /api/applications/:id:', err);
    res.status(500).json({ error: 'Błąd serwera', details: err.message });
  }
});

app.post('/api/update-application-status/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const { error } = await supabase
      .from('submissions')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
    res.status(200).json({ message: 'Status zgłoszenia zaktualizowany' });
  } catch (error) {
    console.error('Error updating application status:', error);
    res.status(500).json({ error: 'Błąd aktualizacji statusu', details: error.message });
  }
});

app.delete('/api/pilots/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { data: pilot, error: fetchError } = await supabase
      .from('pilots')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !pilot) {
      console.error('Pilot not found:', id, fetchError);
      return res.status(404).json({ error: 'Pilot not found' });
    }

    const { error } = await supabase
      .from('pilots')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(200).json({ message: 'Pilot usunięty pomyślnie' });
  } catch (err) {
    console.error('Error deleting pilot:', err);
    res.status(500).json({ error: 'Błąd usuwania pilota', details: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Serwer działa na http://0.0.0.0:${PORT}`));
