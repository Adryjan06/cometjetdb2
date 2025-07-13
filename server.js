const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const supabase = require('./supabaseClient');

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

app.post('/action', async (req, res) => {
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
