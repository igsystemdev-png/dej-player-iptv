# DEJ PLAYER — versão para Vercel

## Variáveis da Vercel

No projeto da Vercel, abra **Settings → Environment Variables** e configure:

- `GEMINI_API_KEY`: chave privada do Gemini.
- `GEMINI_MODEL`: opcional; padrão `gemini-3.8-flash`.
- `GEMINI_FALLBACK_MODEL`: opcional; padrão `gemini-3.5-flash-lite`.
- `WHATSAPP_NUMBER`: número comercial com código do país, apenas dígitos. O site tem um número padrão configurado.

Selecione **Production** e também **Preview** se quiser usar essas variáveis nos previews. Salve e faça redeploy para que os valores entrem em vigor. Nunca envie `.env.local` ao GitHub.

## Publicar

Importe esta pasta como raiz do projeto. As configurações recomendadas são:

- Framework Preset: **Other**
- Root Directory: `.`
- Build Command e Output Directory: vazios

O site é servido da raiz e as funções ficam em `api/`. `/api/chat` atende o chat e `/api/config` fornece a configuração do WhatsApp. O `vercel.json` configura até 30 segundos para a função de chat.

## Rodar localmente

1. Copie `.env.example` para `.env.local` e preencha `GEMINI_API_KEY`.
2. Rode `npm start` e abra `http://localhost:4173`.

A função valida as mensagens, usa timeout em cada chamada ao Gemini, tenta o modelo reserva em falhas temporárias e retorna erros controlados em JSON.
