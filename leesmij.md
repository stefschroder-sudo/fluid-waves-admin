# Fluid Waves — Administratie

Eén HTML-app plus een Vercel-serverfunctie die facturen met Claude uitleest.

## Structuur

    index.html          de app zelf
    api/extract.js      serverfunctie voor factuurherkenning (draait op Vercel)
    package.json        markeert dit als Node-project voor Vercel
    push.bat            duw wijzigingen naar GitHub
    .gitignore          houdt geheimen buiten Git
    .env.local          JOUW GEHEIME SLEUTEL — staat NIET in Git, zelf aanmaken

## Eenmalige opzet

1. Maak in deze map een bestand `.env.local` met daarin één regel:

       ANTHROPIC_API_KEY=sk-ant-...jouw-sleutel...

   Dit bestand blijft op je pc; `.gitignore` houdt het uit GitHub.

2. Installeer de Vercel CLI (eenmalig, in PowerShell):

       npm install -g vercel

3. Lokaal testen met serverfunctie:

       vercel dev

   Open daarna het adres dat hij toont (meestal http://localhost:3000).
   Nu werkt ook de factuurherkenning lokaal.

## Online zetten

1. Zet deze map in een GitHub-repository.
2. Koppel de repo in Vercel (New Project → Import).
3. Zet in Vercel onder Settings → Environment Variables:

       ANTHROPIC_API_KEY = sk-ant-...jouw-sleutel...

   (dezelfde sleutel als in `.env.local`, maar dan bij Vercel zelf)
4. Deploy. Elke volgende `push.bat` deployt automatisch.

## Belangrijk

- De sleutel staat NOOIT in `index.html` of in Git. Alleen in `.env.local`
  (lokaal) en in de Vercel-omgevingsvariabelen (online).
- Werkt de herkenning lokaal niet? Draai je via `vercel dev` en niet door
  index.html te dubbelklikken? De serverfunctie bestaat alleen onder `vercel dev`.
