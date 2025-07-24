const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const supabase = require('./supabaseClient');
const cors = require('cors');
const ejs = require('ejs');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const allowedOrigins = [
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
    console.log("Mail sent: " + info.response);
  } catch (err) {
    console.error("Error sending email:", err);
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
  console.log('Login request:', { email }); // Debug
  try {
    const { data, error } = await supabase
      .from('pilots')
      .select('id, password, first_login')
      .eq('email', email)
      .single();

    console.log('Supabase response:', { data, error }); // Debug
    if (error || !data) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, data.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('Login successful, pilotId:', data.id); // Debug
    res.status(200).json({ message: 'Login successful', firstLogin: data.first_login, pilotId: data.id });
  } catch (err) {
    console.error('Server error in /api/login:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/pilot/:id', async (req, res) => {
  const { id } = req.params;
  console.log('Fetching pilot:', { id }); // Debug
  try {
    const { data, error } = await supabase
      .from('pilots')
      .select('id, name, email, registrations')
      .eq('id', id)
      .single();

    if (error || !data) {
      console.log('Pilot not found:', { id, error }); // Debug
      return res.status(404).json({ error: 'Pilot not found' });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('Server error in /api/pilot/:id:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/api/submit', async (req, res) => {
  const { name, email, callsign, experience, reason, aircrafts } = req.body;
  console.log('Received /api/submit:', { name, email, callsign, experience, reason, aircrafts });
  try {
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
      return res.status(500).json({ error: 'Database error', details: error.message });
    }

    await sendEmail(email, "Thank you for your application!", "Your application has been accepted. We will get back to you within 3 days.");
    res.status(200).json({ message: 'Application submitted successfully' });
  } catch (err) {
    console.error('Server error in /api/submit:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
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

app.get('/api/pilots', async (req, res) => {
  try {
    console.log('Fetching pilots from Supabase...');
    const { data, error } = await supabase
      .from('pilots')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error in /api/pilots:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }
    console.log('Pilots fetched:', data);
    res.json(data);
  } catch (err) {
    console.error('Server error in /api/pilots:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
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

    if (action === "accept") {
      // Generate temporary password
      const tempPassword = generateTempPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Generate registrations if not provided
      let assignedRegistrations = registrations || {};
      if (!registrations || Object.keys(registrations).length === 0) {
        assignedRegistrations = {};
        data.selected_aircrafts.forEach(aircraft => {
          const letter = aircraftRegistrationMap[aircraft];
          const code = generateRandomCode();
          assignedRegistrations[aircraft] = `SP-${code[0]}${letter}${code[1]}`;
        });
      }

      // Validate registrations
      for (const [aircraft, reg] of Object.entries(assignedRegistrations)) {
        if (!reg.match(/^SP-[A-Z]{3}$/)) {
          console.error('Invalid registration format:', { aircraft, reg });
          return res.status(400).json({ error: `Nieprawidłowy format rejestracji dla ${aircraft}: ${reg}. Użyj formatu SP-XYZ.` });
        }
      }

      // Create pilot account
      console.log('Creating pilot account:', { email: data.email, name: data.name, registrations: assignedRegistrations });
      const { error: pilotError } = await supabase
        .from('pilots')
        .insert([{
          email: data.email,
          name: data.name,
          password: hashedPassword,
          registrations: assignedRegistrations,
          first_login: true,
          created_at: new Date().toISOString()
        }]);

      if (pilotError) {
        console.error('Błąd tworzenia konta pilota:', pilotError);
        return res.status(500).json({ error: 'Błąd tworzenia konta pilota', details: pilotError.message });
      }

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
            loginUrl: 'https://comet-jet-site.vercel.app/login'
          }
        );
        await sendEmail(data.email, "Welcome to CometJet!", emailContent, true);
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
        await sendEmail(data.email, "CometJet - Recruitment Outcome Notification", rejectionMessage);
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

    res.status(200).json({ message: 'Action completed successfully' });
  } catch (err) {
    console.error('Błąd w /api/action:', err);
    res.status(500).json({ error: 'Błąd przetwarzania akcji', details: err.message });
  }
});

app.post('/api/update-pilot', async (req, res) => {
  const { id, name, email, registrations } = req.body;
  console.log('Received /api/update-pilot request:', { id, name, email, registrations });
  try {
    // Validate registrations
    for (const [aircraft, reg] of Object.entries(registrations || {})) {
      if (!reg.match(/^SP-[A-Z]{3}$/)) {
        console.error('Invalid registration format:', { aircraft, reg });
        return res.status(400).json({ error: `Nieprawidłowy format rejestracji dla ${aircraft}: ${reg}. Użyj formatu SP-XYZ.` });
      }
    }

    const { error } = await supabase
      .from('pilots')
      .update({ name, email, registrations })
      .eq('id', id);

    if (error) {
      console.error('Błąd aktualizacji pilota:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }
    res.status(200).json({ message: 'Pilot updated successfully' });
  } catch (err) {
    console.error('Server error in /api/update-pilot:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/api/change-password', async (req, res) => {
  try {
    const { pilotId, currentPassword, newPassword } = req.body;
    console.log('Change password request:', { pilotId }); // Debug
    if (!pilotId || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Brak wymaganych danych' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Nowe hasło musi mieć co najmniej 8 znaków' });
    }
    // Pobierz dane pilota
    const { data: pilot, error } = await supabase
      .from('pilots')
      .select('*')
      .eq('id', pilotId)
      .single();
    console.log('Supabase response:', { pilot, error }); // Debug
    if (error || !pilot) {
      return res.status(404).json({ error: 'Pilot nie znaleziony' });
    }
    // Sprawdź aktualne hasło
    const validPassword = await bcrypt.compare(currentPassword, pilot.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Nieprawidłowe aktualne hasło' });
    }
    // Zahashuj nowe hasło
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    // Zaktualizuj hasło i ustaw first_login na false
    const { error: updateError } = await supabase
      .from('pilots')
      .update({ password: hashedNewPassword, first_login: false })
      .eq('id', pilotId);
    if (updateError) {
      console.error('Błąd aktualizacji hasła:', updateError);
      return res.status(500).json({ error: 'Błąd aktualizacji hasła' });
    }
    // Wyślij email z potwierdzeniem
    await sendEmail(
      pilot.email,
      'Potwierdzenie zmiany hasła',
      `Twoje hasło w systemie CometJet zostało pomyślnie zmienione. Jeśli to nie Ty dokonałeś zmiany, skontaktuj się z administratorem.`,
      false
    );
    return res.json({ message: 'Hasło zmienione pomyślnie' });
  } catch (error) {
    console.error('Błąd zmiany hasła:', error);
    return res.status(500).json({ error: 'Błąd serwera' });
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
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(data);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/api/posts', async (req, res) => {
  const { id, title, content, author, image_url, is_published } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
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
    console.error('Błąd bazy danych:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
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
    res.status(200).json({ message: 'Post deleted' });
  } catch (err) {
    console.error('Błąd bazy danych:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.post('/api/send-email', async (req, res) => {
  const { to, subject, message } = req.body;
  try {
    await sendEmail(to, subject, message);
    res.status(200).json({ message: 'Email sent successfully' });
  } catch (err) {
    console.error('Błąd wysyłania emaila:', err);
    res.status(500).json({ error: 'Błąd wysyłania emaila', details: err.message });
  }
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/pilot-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pilot-dashboard.html'));
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
