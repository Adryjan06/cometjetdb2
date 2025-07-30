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
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key'; // Ustaw w zmiennych środowiskowych na Render

// Sprawdzenie JWT_SECRET
if (!process.env.JWT_SECRET) {
  console.warn('Warning: JWT_SECRET is not set in environment variables. Using default value.');
}

// CORS configuration
const allowedOrigins = [
  'https://comet-jet-site.vercel.app',
  'https://comet-jet-site.vercel.app',
  'https://cometjetdb2.onrender.com',
  'http://localhost:3000'
];

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

// JWT Middleware
const verifyToken = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  console.log('Verifying token:', {
    token: token ? '***' : null,
    headers: req.headers['authorization'] ? 'Authorization header present' : 'No Authorization header'
  });
  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ error: 'Brak tokenu, zaloguj się' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Token decoded:', { pilotId: decoded.pilotId, role: decoded.role, name: decoded.name });
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Invalid token:', err.message);
    return res.status(401).json({ error: 'Nieprawidłowy lub wygasły token', details: err.message });
  }
};

const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    console.log('Access denied, not an admin:', { role: req.user.role });
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
    console.log('Mail sent:', info.response);
    return { success: true, response: info.response };
  } catch (err) {
    console.error('Error sending email:', err);
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
  console.log('Login request:', { email, password: '***' });
  try {
    const { data, error } = await supabase
      .from('pilots')
      .select('id, password, first_login, role, name')
      .eq('email', email)
      .single();

    console.log('Supabase response:', { data: data ? { id: data.id, first_login: data.first_login, role: data.role } : null, error });
    if (error || !data) {
      console.log('Pilot not found for email:', email);
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
    }

    const isMatch = await bcrypt.compare(password, data.password);
    console.log('Password match:', { isMatch });
    if (!isMatch) {
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
    }

    // Generate JWT
    const token = jwt.sign(
      { pilotId: data.id, role: data.role, name: data.name },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    console.log('Login successful, pilotId:', data.id, 'role:', data.role, 'token:', '***');
    res.status(200).json({ message: 'Logowanie pomyślne', token, firstLogin: data.first_login, pilotId: data.id, role: data.role, name: data.name });
  } catch (err) {
    console.error('Server error in /api/login:', err);
    res.status(500).json({ error: 'Błąd serwera', details: err.message });
  }
});


app.get('/api/full-applications', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Popraw endpoint dla pojedynczego pilota
app.get('/api/pilots/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('pilots')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.get('/api/pilot/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.pilotId !== id && req.user.role !== 'admin') {
      console.log('Access denied to pilot data:', { requestedId: id, userId: req.user.pilotId, role: req.user.role });
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
    console.error('Error fetching pilot:', error);
    res.status(500).json({ error: 'Błąd pobierania danych pilota', details: error.message });
  }
});

app.post('/api/submit', async (req, res) => {
  const {
    name, discord, newsky, birthdate, continent, airport,
    simulationExperience, simulator, onlineNetwork,
    flyingType, otherVA, discovery,
    experience, reason, aircrafts
  } = req.body;

  try {
    const { data, error } = await supabase
      .from('submissions')
      .insert([{
        name,
        email: req.body.email,
        discord,
        callsign: newsky, // Używamy callsign zamiast newsky
        birth_date: birthdate, // Mapujemy na birth_date
        continent,
        icao: airport, // Mapujemy airport na icao
        interest_duration: simulationExperience, // Mapujemy na interest_duration
        simulator: Array.isArray(simulator) ? simulator : [simulator],
        networks: onlineNetwork, // Mapujemy na networks
        flight_types: Array.isArray(flyingType) ? flyingType : [flyingType], // Mapujemy na flight_types
        other_airlines: otherVA, // Mapujemy na other_airlines
        source: Array.isArray(discovery) ? discovery : [discovery], // Mapujemy na source
        experience,
        reason,
        selected_aircrafts: aircrafts
      }]);

    if (error) {
      console.error('Supabase error in /api/submit:', error);
      return res.status(500).json({ error: 'Błąd bazy danych', details: error.message });
    }

    await sendEmail(req.body.email, "Dziękujemy za zgłoszenie!", "Twoje zgłoszenie zostało przyjęte. Odezwiemy się w ciągu 3 dni.");
    res.status(200).json({ message: 'Zgłoszenie przesłane pomyślnie' });
  } catch (err) {
    console.error('Server error in /api/submit:', err);
    res.status(500).json({ error: 'Błąd serwera', details: err.message });
  }
});

app.get('/api/applications/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
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

app.get('/api/applications', verifyToken, verifyAdmin, async (req, res) => {
  try {
    console.log('Fetching applications from Supabase...');
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error in /api/applications:', error);
      return res.status(500).json({ error: 'Błąd bazy danych', details: error.message });
    }
    console.log('Applications fetched:', data.length, 'records');
    res.json(data);
  } catch (err) {
    console.error('Server error in /api/applications:', err);
    res.status(500).json({ error: 'Błąd serwera', details: err.message });
  }
});

app.get('/api/pilots', verifyToken, verifyAdmin, async (req, res) => {
  try {
    console.log('Fetching pilots from Supabase...');
    const { data, error } = await supabase
      .from('pilots')
      .select('id, name, email, registrations, role, registration_code')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error in /api/pilots:', error);
      return res.status(500).json({ error: 'Błąd bazy danych', details: error.message });
    }
    console.log('Pilots fetched:', data.length, 'records');
    res.json(data);
  } catch (err) {
    console.error('Server error in /api/pilots:', err);
    res.status(500).json({ error: 'Błąd serwera', details: err.message });
  }
});

app.get('/api/posts', async (req, res) => {
  try {
    console.log('Fetching posts from Supabase...');
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error in /api/posts:', error);
      return res.status(500).json({ error: 'Błąd bazy danych', details: error.message });
    }
    console.log('Posts fetched:', data.length, 'records');
    res.json(data);
  } catch (err) {
    console.error('Server error in /api/posts:', err);
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
      console.error('Supabase error in /admin:', appError);
      return res.status(500).send('Błąd bazy danych');
    }

    res.render('admin', { applications: applications || [] });
  } catch (err) {
    console.error('Błąd serwera w /admin:', err);
    res.status(500).send('Wewnętrzny błąd serwera');
  }
});

app.post('/api/action', verifyToken, verifyAdmin, async (req, res) => {
  const { id, action, registrations } = req.body;
  console.log('Received /api/action request:', { id, action, registrations });

  try {
    const { data, error } = await supabase.from('submissions').select('*').eq('id', id).single();
    if (!data || error) {
      console.error('Błąd pobierania zgłoszenia:', error);
      return res.status(404).json({ error: 'Zgłoszenie nie znalezione', details: error?.message });
    }

    if (data.status === 'accept' || data.status === 'reject') {
      console.log(`Zgłoszenie ${id} już ma status: ${data.status}`);
      return res.status(400).json({ error: `Zgłoszenie już przetworzone jako ${data.status}` });
    }

    // Ensure selected_aircrafts is an array
    let selectedAircrafts = data.selected_aircrafts;
    if (typeof selectedAircrafts === 'string') {
      selectedAircrafts = selectedAircrafts.split(',').map(s => s.trim());
    } else if (!Array.isArray(selectedAircrafts)) {
      selectedAircrafts = [];
    }

    if (action === "accept") {
      // Generate temporary password
      const tempPassword = generateTempPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Generate registrations if not provided
      let assignedRegistrations = registrations || {};
      if (!registrations || Object.keys(registrations).length === 0) {
        assignedRegistrations = {};
        if (selectedAircrafts.length === 0) {
          console.warn('No selected aircrafts for registration generation:', { id });
          return res.status(400).json({ error: 'Nie wybrano samolotów do rejestracji' });
        }
        selectedAircrafts.forEach(aircraft => {
          const letter = aircraftRegistrationMap[aircraft];
          if (letter) {
            const code = generateRandomCode();
            assignedRegistrations[aircraft] = `SP-${code[0]}${letter}${code[1]}`;
          }
        });
      }

      // Validate registrations
      for (const [aircraft, reg] of Object.entries(assignedRegistrations)) {
        if (!reg.match(/^SP-[A-Z]{3}$/)) {
          console.error('Invalid registration format:', { aircraft, reg });
          return res.status(400).json({ error: `Nieprawidłowy format rejestracji dla ${aircraft}: ${reg}. Użyj formatu SP-XYZ.` });
        }
      }

      // Create pilot account with default role 'user'
      console.log('Creating pilot account:', { email: data.email, name: data.name, registrations: assignedRegistrations, role: 'user' });
      const { data: newPilot, error: pilotError } = await supabase
        .from('pilots')
        .insert([{
          email: data.email,
          name: data.name,
          password: hashedPassword,
          registrations: assignedRegistrations,
          first_login: true,
          role: 'user',
          created_at: new Date().toISOString(),
          registration_code: generateRandomCode()
        }])
        .select('id')
        .single();

      if (pilotError) {
        console.error('Błąd tworzenia konta pilota:', pilotError);
        return res.status(500).json({ error: 'Błąd tworzenia konta pilota', details: pilotError.message });
      }

      console.log('New pilot created with id:', newPilot.id);
      // Update submission with registrations and status
      console.log('Updating submission:', { id, status: action, registrations: assignedRegistrations });
      const { error: updateError } = await supabase
        .from('submissions')
        .update({
          status: action,
          registrations: assignedRegistrations
        })
        .eq('id', id);

      if (updateError) {
        console.error('Błąd aktualizacji zgłoszenia:', updateError);
        return res.status(500).json({ error: 'Błąd aktualizacji zgłoszenia', details: updateError.message });
      }

      try {
        const emailContent = await ejs.renderFile(
          path.join(__dirname, 'views', 'email-template.ejs'),
          {
            name: data.name,
            tempPassword,
            loginUrl: 'https://cometjetdb2.onrender.com/login.html'
          }
        );
        await sendEmail(data.email, "Witaj w CometJet!", emailContent, true);
      } catch (emailErr) {
        console.error('Błąd wysyłania emaila:', emailErr);
        return res.status(500).json({ error: 'Błąd wysyłania emaila', details: emailErr.message });
      }
    } else {
      const rejectionMessage = `
# CometJet - Recruitment Outcome Notification

Dear ${data.name},

We regret to inform you that your application for the pilot position at CometJet has not been successful. We sincerely appreciate your interest in our airline and the time you invested in submitting your application.

Your passion for aviation is commendable, and we are confident it will find a place in other professional opportunities. We wish you the best of luck in your future career endeavors and in pursuing your aviation aspirations.

Should you have any questions, please feel free to reach out via our Discord server, where we are happy to provide further information.

Best regards,  
KayJayKay and Aviaced  
CometJet VA CEOs
      `;
      try {
        await sendEmail(data.email, "CometJet - Wynik rekrutacji", rejectionMessage);
      } catch (emailErr) {
        console.error('Błąd wysyłania emaila:', emailErr);
        return res.status(500).json({ error: 'Błąd wysyłania emaila', details: emailErr.message });
      }

      const { error: updateError } = await supabase
        .from('submissions')
        .update({ status: action })
        .eq('id', id);

      if (updateError) {
        console.error('Błąd aktualizacji zgłoszenia:', updateError);
        return res.status(500).json({ error: 'Błąd aktualizacji zgłoszenia', details: updateError.message });
      }
    }

    res.status(200).json({ message: 'Akcja wykonana pomyślnie' });
  } catch (err) {
    console.error('Błąd w /api/action:', err);
    res.status(500).json({ error: 'Błąd przetwarzania akcji', details: err.message });
  }
});

app.post('/api/update-pilot', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id, name, email, registrations, role, registration_code } = req.body;
    console.log('Received /api/update-pilot request:', { id, name, email, registrations, role, registration_code });
    const { data, error } = await supabase
      .from('pilots')
      .update({ name, email, registrations, role, registration_code })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Supabase error in /api/update-pilot:', error);
      throw error;
    }
    console.log('Pilot updated successfully:', data);
    res.json(data);
  } catch (error) {
    console.error('Error updating pilot:', error);
    res.status(500).json({ error: 'Błąd aktualizacji pilota', details: error.message });
  }
});

app.post('/api/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const pilotId = req.user.pilotId;
    console.log('Change password request:', { pilotId, currentPassword: '***', newPassword: '***' });

    // Sprawdzenie, czy podano wymagane dane
    if (!currentPassword || !newPassword) {
      console.log('Missing required fields:', { currentPassword: !!currentPassword, newPassword: !!newPassword });
      return res.status(400).json({ error: 'Aktualne i nowe hasło są wymagane' });
    }

    // Walidacja długości nowego hasła
    if (newPassword.length < 8) {
      console.log('New password too short:', { length: newPassword.length });
      return res.status(400).json({ error: 'Nowe hasło musi mieć co najmniej 8 znaków' });
    }

    // Pobierz dane pilota
    const { data: pilot, error: fetchError } = await supabase
      .from('pilots')
      .select('id, email, password, first_login')
      .eq('id', pilotId)
      .single();
    console.log('Supabase fetch pilot:', {
      pilotId,
      pilot: pilot ? { id: pilot.id, email: pilot.email, first_login: pilot.first_login } : null,
      fetchError
    });

    if (fetchError || !pilot) {
      console.log('Pilot not found for id:', pilotId);
      return res.status(404).json({ error: 'Pilot nie znaleziony', details: fetchError?.message });
    }

    // Sprawdź aktualne hasło (tylko jeśli first_login jest false)
    if (!pilot.first_login) {
      const validPassword = await bcrypt.compare(currentPassword, pilot.password);
      console.log('Password validation:', { validPassword });
      if (!validPassword) {
        console.log('Invalid current password for pilotId:', pilotId);
        return res.status(401).json({ error: 'Nieprawidłowe aktualne hasło' });
      }
    }

    // Zahashuj nowe hasło
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    console.log('New password hashed for pilotId:', pilotId);

    // Zaktualizuj hasło i ustaw first_login na false
    const { data: updatedPilot, error: updateError } = await supabase
      .from('pilots')
      .update({ password: hashedNewPassword, first_login: false })
      .eq('id', pilotId)
      .select('id, email, first_login')
      .single();
    console.log('Supabase update pilot:', {
      updatedPilot: updatedPilot ? { id: updatedPilot.id, email: updatedPilot.email, first_login: updatedPilot.first_login } : null,
      updateError
    });

    if (updateError) {
      console.error('Błąd aktualizacji hasła:', updateError);
      return res.status(500).json({ error: 'Błąd aktualizacji hasła', details: updateError.message });
    }

    // Wyślij email z potwierdzeniem
    try {
      const emailResult = await sendEmail(
        pilot.email,
        'Potwierdzenie zmiany hasła - CometJet',
        `Twoje hasło w systemie CometJet zostało pomyślnie zmienione. Jeśli to nie Ty dokonałeś zmiany, skontaktuj się z administratorem.`,
        false
      );
      console.log('Password change email sent:', { email: pilot.email, result: emailResult });
    } catch (emailErr) {
      console.error('Błąd wysyłania emaila potwierdzającego:', emailErr);
      // Nie przerywamy odpowiedzi, bo hasło zostało zmienione
    }

    return res.status(200).json({ message: 'Hasło zmienione pomyślnie', updatedPilot: { id: updatedPilot.id, first_login: updatedPilot.first_login } });
  } catch (error) {
    console.error('Błąd zmiany hasła:', error);
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
    console.error('Server error in /api/posts/:id:', err);
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
    console.error('Błąd bazy danych w /api/posts:', err);
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
    console.error('Błąd bazy danych w /api/posts/:id:', err);
    res.status(500).json({ error: 'Błąd bazy danych', details: err.message });
  }
});

app.post('/api/send-email', verifyToken, verifyAdmin, async (req, res) => {
  const { to, subject, message } = req.body;
  try {
    await sendEmail(to, subject, message);
    res.status(200).json({ message: 'Email wysłany pomyślnie' });
  } catch (err) {
    console.error('Błąd wysyłania emaila:', err);
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

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.exp * 1000 < Date.now()) {
          return res.status(401).json({ error: 'Sesja wygasła' });
        }
      } catch (e) {
        // Ignore invalid tokens for non-auth routes
      }
    }
  }
  next();
});

// Dodaj nowy endpoint dla keepalive
app.head('/api/keepalive', (req, res) => {
  res.status(200).end();
});

// Dodaj też GET dla kompatybilności
app.get('/api/keepalive', (req, res) => {
  res.status(200).send('OK');
});

app.get('/api/full-applications', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.listen(PORT, () => console.log(`Serwer działa na http://localhost:${PORT}`));
