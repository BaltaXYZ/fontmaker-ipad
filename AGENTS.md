# Arbetsmetodik: Säkerställa att en feature/app faktiskt fungerar

Detta är standardprocessen för **alla** features (inte bara API-integreringar).

## 1. Kravlåsning
1. Tolka slutmålet till konkreta acceptanskriterier.
2. Definiera "klart" i mätbara termer (exakta beteenden, data, UI-flöden, felhantering).

## 2. End-to-end-genomförande
1. Implementera nödvändiga kodändringar.
2. Använd terminal, serverkörning och relevanta verktyg för att verifiera i verklig körning.
3. Använd utökade befogenheter när det krävs för att kunna felsöka och validera fullt ut.
4. Gör minsta möjliga förändring: vid bugfix eller feature-arbete får endast den kod som krävs för just den ändringen modifieras.

## 2.1 Minimal ändringsyta (obligatoriskt)
1. Ändra endast filer, funktioner och logik som är direkt berörda av kravet.
2. Undvik opportunistiska refaktoriseringar och sidoförändringar som inte krävs för att lösa uppgiften.
3. Om en större följdändring krävs tekniskt, motivera den explicit och håll den så liten som möjligt.

## 3. Obligatorisk verifiering (inte teori)
1. Starta app/server lokalt.
2. Testa berörda flöden med riktiga anrop/interaktioner.
3. Bekräfta att resultatet matchar krav (data, status, UI, edge cases).
4. Kontrollera felvägar (t.ex. timeout, tom data, fel input) och att appen beter sig korrekt.

## 4. Felsökningsloop tills det fungerar
1. Vid fel: hitta rotorsak med loggar, responses, kodspårning.
2. Åtgärda.
3. Verifiera igen från början (end-to-end).
4. Upprepa tills acceptanskriterierna är uppfyllda.

## 5. Definition of Done (måste uppfyllas)
1. Feature fungerar i praktisk körning enligt krav.
2. Relevanta tester/checkar är körda och passerar (eller blockerare är explicit redovisad).
3. Inga kända regressionsfel i berörda delar.
4. Tydlig redovisning av vad som testats och observerat utfall.

## 6. Leveransrapport
1. Vad som ändrats.
2. Exakt hur det verifierades.
3. Faktiska resultat.
4. Eventuella kvarvarande externa beroenden (om några), tydligt och konkret.

Denna metodik gäller för alla uppdrag där målet är att en feature/app ska fungera enligt krav.

---

# App-specifik info (FontMaker iPad)

Det här repot `/Users/baltax/Documents/apps/fontmaker-ipad` innehåller en **helt statisk** webapp (HTML/CSS/JS, ingen backend) för iPad Safari + Apple Pencil där man ritar glypher och exporterar en font.

## Nuvarande status (MVP implementerad)
- Editor: canvas med Pointer Events (pen/finger), `touch-action: none`, stroke-capture (punkter `x,y,t,pressure`), render av strokes + guide-linjer.
- Per glyph: undo/redo/clear (minst per stroke) och reglage för `Brush width` samt `Advance width`.
- Glyph-grid med status per tecken (`empty|partial|done`) och filter (All, A-Z, a-z, 0-9, ÅÄÖ, Punct).
- Charset:
  - Required (export blockeras om ej “done”): `A-Z`, `a-z`, `0-9`, `ÅÄÖ`, `åäö`.
  - Optional (ingår i font men får vara tomma): mellanslag + `.,!?-()`.
- Export:
  - OTF-export via `opentype.js` och `Blob` download.
  - `.notdef` inkluderas.
  - “Build preview font” bygger en transient FontFace från genererad OTF och applicerar på preview-text.
- Project I/O: export/import av projekt som JSON (ingen långtidssparning annars).

## Viktiga filer
- `/Users/baltax/Documents/apps/fontmaker-ipad/index.html`: HTML + script-includes (UMD/vendor) + UI.
- `/Users/baltax/Documents/apps/fontmaker-ipad/styles.css`: styling + layout (sidebar + editor).
- `/Users/baltax/Documents/apps/fontmaker-ipad/app.js`: app-state, charset, grid/filter, export gating, wiring av UI.
- `/Users/baltax/Documents/apps/fontmaker-ipad/editor.js`: canvas input, stroke-capture, undo/redo/clear, rendering + guides.
- `/Users/baltax/Documents/apps/fontmaker-ipad/outline.js`: stroke -> filled outline (polygon) + union + simplify; levererar contours till font-export.
- `/Users/baltax/Documents/apps/fontmaker-ipad/font-export.js`: bygger `opentype.Font`, skapar glyph-paths och exporterar OTF + preview FontFace.
- `/Users/baltax/Documents/apps/fontmaker-ipad/project-io.js`: export/import JSON-format för projekt.

## Vendor/externa beroenden (vendored, inga bundlers)
- `/Users/baltax/Documents/apps/fontmaker-ipad/vendor/opentype.min.js` (font build/export).
- `/Users/baltax/Documents/apps/fontmaker-ipad/vendor/martinez.min.js` (polygon union).
- `/Users/baltax/Documents/apps/fontmaker-ipad/vendor/simplify.min.js` (polyline/polygon simplify; global `simplify`).

## Hur man kör
- Öppna `/Users/baltax/Documents/apps/fontmaker-ipad/index.html` direkt i Safari (`file://`) eller servera katalogen statiskt (valfri statisk server). Ingen backend krävs.

## Verifiering som ska göras (end-to-end)
- Rita minst: `A B C a b c 0 1 2 Å Ä Ö å ä ö`.
- Tryck `Export OTF` och öppna OTF i t.ex. macOS Font Book och verifiera att text som `AaÅåÖö012` renderar och att glyph-map är korrekt.
- Felväg: försök exportera utan att ha ritat alla required glyphs och bekräfta att export blockeras och att listan visar exakt vilka som saknas.
- Testa `Clear` på en required glyph och bekräfta att status går tillbaka.
- Testa JSON export/import och att export fortfarande fungerar efter import.

## Kända begränsningar / risker (MVP)
- Outlines genereras som **linje-segment** (inga Bezier-curves) och med en enkel “stroke expansion”-modell; kvaliteten kan variera för komplexa strokes.
- Polygon-union kan i vissa edge cases misslyckas (self-intersections etc). Nuvarande beteende: union best-effort; om union fallerar exporteras separata konturer (kan ge artefakter men loggas och appen fortsätter).
- Ingen kerning/ligaturer/hinting, ingen fler vikt/italic, ingen WOFF/WOFF2.
- Lokal server-start kunde inte verifieras i Codex-sandbox (port-lyssning nekas), så praktisk verifiering måste göras via Safari.

## Beslut som är låsta i implementationen
- `unitsPerEm=1000`, `ascender=800`, `descender=-200`, `lineGap=200`, `capHeight=700`, `xHeight=500`.
- Exportformat: OTF (CFF) via `opentype.js` (best effort `font.outlinesFormat='cff'`).
- Editor: fast vy (ingen zoom/pan i MVP).

# Steg-för-steg vid manuella moment (på användarens sida)
När användaren MÅSTE göra många manuella steg i externa verktyg (t.ex. Vercel, Cloudflare, Backblaze, Google Cloud):
1. Ge **ett steg i taget** (inte en lång lista).
2. Varje steg måste börja med vilket **program** det gäller, i rubrikformatet: `Steg X (Program: <verktyg/app>)`.
   Exempel: `Steg 3 (Program: Webbläsare, Vercel Dashboard)`.
3. Beskriv **vad användaren ska göra** i praktiken, med exakta klick/menyvägar.
4. Be användaren svara **“klar”** innan nästa steg ges.
5. Om ett steg beror på saknade förutsättningar (t.ex. konto saknas), börja med det som krävs för att kunna gå vidare.
