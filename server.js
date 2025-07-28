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
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// CORS configuration
const allowedOrigins = [
  'https://cometjetdb2.onrender.com',
  'http://localhost:3000'
];

function generateTempPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateRandomCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: 2 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (origin.includes('vercel.app') && origin.startsWith('https://comet-jet-site')) {
      return callback(null, true);
    }
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

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

// Generate random 2-letter code for registration
function generateRandomCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 2; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return code;
}

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
    return { success: true, response: info.response };
  } catch (err) {
    throw err;
  }
}

// Generate temporary password
function generateTempPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Endpoints
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase
      .from('pilots')
      .select('id, password, first_login, role, name')
      .eq('email', email)
      .single();

    if (error || !data) {
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
    }

    const isMatch = await bcrypt.compare(password, data.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
    }

    // Generate JWT
    const token = jwt.sign(
      { pilotId: data.id, role: data.role, name: data.name },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.status(200).json({ message: 'Logowanie pomyślne', token, firstLogin: data.first_login, pilotId: data.id, role: data.role, name: data.name });
  } catch (err) {
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
    // Validate required fields
    const requiredFields = { name, email, callsign, birth_date, continent, experience, reason };
    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        return res.status(400).json({ error: `Pole ${key} jest wymagane` });
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Nieprawidłowy format emaila' });
    }

    // Validate age (minimum 13 years)
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

    // Validate ICAO code
    if (icao && !/^[A-Z]{4}$/.test(icao)) {
      return res.status(400).json({ error: 'Nieprawidłowy kod ICAO' });
    }

    // Ensure aircrafts is an array
    const aircraftsArray = Array.isArray(aircrafts)
      ? aircrafts
      : typeof aircrafts === 'string'
        ? aircrafts.split(',').map(s => s.trim())
        : [];
    if (aircraftsArray.length === 0 || aircraftsArray.length > 3) {
      return res.status(400).json({ error: 'Wybierz od 1 do 3 samolotów' });
    }

    // Ensure networks is an array
    const networksArray = Array.isArray(networks)
      ? networks
      : typeof networks === 'string'
        ? networks.split(',').map(s => s.trim())
        : [];

    // Insert into submissions table
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
      return res.status(500).json({ error: 'Błąd bazy danych', details: error.message });
    }

    await sendEmail(email, "Dziękujemy za zgłoszenie!", "Twoje zgłoszenie zostało przyjęte. Odezwiemy się w ciągu 3 dni.");
    res.status(200).json({ message: 'Zgłoszenie przesłane pomyślnie' });
  } catch (err) {
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
      return res.status(500).json({ error: 'Błąd bazy danych', details: error.message });
    }
    res.json(data);
  } catch (err) {
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
      return res.status(500).json({ error: 'Błąd bazy danych', details: error.message });
    }
    res.json(data);
  } catch (err) {
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
      return res.status(500).json({ error: 'Błąd bazy danych', details: error.message });
    }
    res.json(data);
  } catch (err) {
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
      return res.status(500).send('Błąd bazy danych');
    }

    res.render('admin', { applications: applications || [] });
  } catch (err) {
    res.status(500).send('Wewnętrzny błąd serwera');
  }
});

app.post('/api/action', verifyToken, verifyAdmin, async (req, res) => {
  const { id, action } = req.body;

  try {
    // Pobierz aplikację
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (!data || error) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (action === "accept") {
      // Generuj tymczasowe hasło
      const tempPassword = generateTempPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Twórz konto pilota
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
        return res.status(500).json({ error: 'Error creating pilot account' });
      }

      // Aktualizuj status aplikacji
      const { error: updateError } = await supabase
        .from('submissions')
        .update({
          status: 'accept',
          pilot_id: newPilot.id
        })
        .eq('id', id);

      if (updateError) {
        return res.status(500).json({ error: 'Error updating application' });
      }

      // Wyślij email powitalny
      const emailContent = await ejs.renderFile(
        path.join(__dirname, 'views', 'welcome-email.ejs'),
        { name: data.name, tempPassword }
      );

      await sendEmail(data.email, "Welcome to CometJet!", emailContent, true);

    } else if (action === "reject") {
      // Aktualizuj status aplikacji
      const { error: updateError } = await supabase
        .from('submissions')
        .update({ status: 'reject' })
        .eq('id', id);

      if (updateError) {
        return res.status(500).json({ error: 'Error updating application' });
      }

      // Wyślij email z odmową
      const rejectionMsg = `Your application has been reviewed but we cannot offer you a position at this time.`;
      await sendEmail(data.email, "CometJet Application Status", rejectionMsg);
    }

    res.status(200).json({ message: 'Action completed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.post('/api/update-pilot', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id, name, email, registrations, role, registration_code } = req.body;
    const { data, error } = await supabase
      .from('pilots')
      .update({ name, email, registrations, role, registration_code })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    res.json(data);
  } catch (error) {
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
      return res.status(500).json({ error: 'Błąd aktualizacji hasła', details: updateError.message });
    }

    try {
      await sendEmail(
        pilot.email,
        'Potwierdzenie zmiany hasła - CometJet',
        `Twoje hasło w systemie CometJet zostało pomyślnie zmienione.`,
        false
      );
    } catch (emailErr) { }

    return res.status(200).json({ message: 'Hasło zmienione pomyślnie', updatedPilot: { id: updatedPilot.id, first_login: updatedPilot.first_login } });
  } catch (error) {
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
      return res.status(404).json({ error: 'Post nie znaleziony' });
    }
    res.json(data);
  } catch (err) {
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
    res.status(500).json({ error: 'Błąd bazy danych', details: err.message });
  }
});

app.post('/api/send-email', verifyToken, verifyAdmin, async (req, res) => {
  const { to, subject, message } = req.body;
  try {
    await sendEmail(to, subject, message);
    res.status(200).json({ message: 'Email wysłany pomyślnie' });
  } catch (err) {
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
      return res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera', details: err.message });
  }
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
      return res.status(404).json({ error: 'Application not found' });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
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
    res.status(500).json({ error: 'Błąd aktualizacji statusu', details: error.message });
  }
});

// Akceptacja zgłoszenia i tworzenie konta pilota
app.post('/api/accept-application/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // Pobierz aplikację
    const { data: application, error: appError } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Generuj kod rejestracji
    const registrationCode = generateRandomCode();

    // Stwórz konto pilota
    const { data: pilot, error: pilotError } = await supabase
      .from('pilots')
      .insert([{
        email: application.email,
        name: application.name,
        password: await bcrypt.hash(generateTempPassword(), 10),
        first_login: true,
        role: 'user',
        registration_code: registrationCode,
        registrations: {}
      }])
      .select('id')
      .single();

    if (pilotError) {
      throw pilotError;
    }

    // Aktualizuj status zgłoszenia
    await supabase
      .from('submissions')
      .update({
        status: 'accept',
        pilot_id: pilot.id
      })
      .eq('id', id);

    res.status(200).json({ message: 'Application accepted' });
  } catch (err) {
    console.error('Error accepting application:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Odrzucenie zgłoszenia
app.post('/api/reject-application/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    // Pobierz aplikację
    const { data: application, error: appError } = await supabase
      .from('submissions')
      .select('email')
      .eq('id', id)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Aktualizuj status
    await supabase
      .from('submissions')
      .update({
        status: 'reject',
        rejection_reason: reason
      })
      .eq('id', id);

    // Wyślij email
    await sendEmail(
      application.email,
      "CometJet Application Status",
      `Your application has been rejected. Reason: ${reason}`
    );

    res.status(200).json({ message: 'Application rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.delete('/api/pilots/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('pilots')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(200).json({ message: 'Pilot usunięty pomyślnie' });
  } catch (err) {
    res.status(500).json({ error: 'Błąd usuwania pilota', details: err.message });
  }
});


app.listen(PORT, () => console.log(`Serwer działa na http://localhost:${PORT}`));
