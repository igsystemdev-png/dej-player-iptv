export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  return res.status(200).json({ whatsappNumber: (process.env.WHATSAPP_NUMBER || '558192878412').replace(/\D/g, '') });
}
