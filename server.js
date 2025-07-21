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
    if (!origin) return callback(null, true); // Allow requests without origin (e.g., Postman)
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
  const { name, email, callsign, experience, reason } = req.body;
  const { data, error } = await supabase
    .from('submissions')
    .insert([{ name, email, callsign, experience, reason }]);

  if (error) return res.status(500).send("Database error");

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

app.post('/api/action', async (req, res) => {
  const { id, action } = req.body;
  const { data, error } = await supabase.from('submissions').select('*').eq('id', id).single();
  if (!data || error) return res.redirect('/admin');

  try {
    if (action === "accept") {
      const emailContent = await ejs.renderFile(
        path.join(__dirname, 'views', 'email-template.ejs'),
        { name: data.name } // Pass the applicant's name to the template
      );
      await sendEmail(data.email, "Welcome to CometJet!", emailContent, true);
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
      await sendEmail(data.email, "CometJet - Recruitment Outcome Notification", rejectionMessage);
    }

    await supabase.from('submissions').update({ status: action }).eq('id', id);
    res.redirect('/admin');
  } catch (err) {
    console.error('Error in /api/action:', err);
    res.status(500).send('Error processing action');
  }
});

app.post('/api/send-email', async (req, res) => {
  const { to, subject, message } = req.body;
  if (!to || !subject || !message) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, message' });
  }

  try {
    await sendEmail(to, subject, message);
    res.status(200).json({ message: 'Email sent' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Error sending email' });
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
    console.error('Database error:', error);
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
    console.error('Database error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
