// Kookhulp: maakt een nieuw recept met Claude.
// Nodig in Vercel (Settings > Environment Variables):
//   ANTHROPIC_API_KEY  jouw API-sleutel van console.anthropic.com
//   KOOKHULP_CODE      zelfgekozen toegangscode, zodat alleen jij recepten laat maken
//   KOOKHULP_MODEL     optioneel, standaard claude-haiku-4-5-20251001

const SYSTEM = `Je bent een kookassistent die recepten schrijft voor een Nederlandse thuiskok die nog leert koken.
Antwoord uitsluitend met één geldig JSON-object. Geen uitleg, geen markdown, geen codeblok.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ fout: 'Alleen POST is toegestaan.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ fout: 'ANTHROPIC_API_KEY ontbreekt in Vercel.' });
  if (!process.env.KOOKHULP_CODE) return res.status(500).json({ fout: 'KOOKHULP_CODE ontbreekt in Vercel.' });
  if (req.headers['x-kookhulp-code'] !== process.env.KOOKHULP_CODE) return res.status(401).json({ fout: 'Onjuiste toegangscode.' });

  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const vraag = String(b.vraag || '').slice(0, 200);
  if (!vraag) return res.status(400).json({ fout: 'Typ eerst waar je zin in hebt.' });

  const lijst = (a) => (Array.isArray(a) ? a.map(String).slice(0, 60).join(', ') : '');
  const prompt = `Maak één recept op basis van deze vraag: "${vraag}"

Instellingen van de kok:
- Kookniveau: ${b.niveau} (1 = beginner, 5 = ervaren). Het recept mag niet moeilijker zijn dan dit niveau.
- Glutenvrij: ${b.glutenvrij ? 'ja, gebruik alleen glutenvrije ingrediënten en noem glutenvrije varianten bij naam' : 'nee'}
- Koolhydraatarm: ${b.koolhydraatarm ? 'ja, geen pasta, rijst, aardappel, brood of suiker' : 'nee'}
- Allergieën: ${lijst(b.allergieen) || 'geen'}. Gebruik GEEN ingrediënt dat een van deze allergenen bevat, ook niet verborgen. Denk bij vis aan vissaus, ansjovis, Worcestersaus, Caesardressing en dashi; bij schaaldieren aan trassi, sambal badjak en garnalenkroepoek. Kies bij twijfel een ander ingrediënt.
- Gewenste keuken: ${b.keuken || 'vrij'} (kies uit: ${lijst(b.keukens)}, of een korte andere naam als niets past)
- Gewenste gang: ${b.gang || 'vrij'}
- Aanwezige apparatuur en gerei (sleutels): ${lijst(b.apparatuur)}. Gebruik alleen deze. Thermomix betekent een TM5.
- Aantal kookpitten: ${b.pitten}
- Recepten die al bestaan (maak iets anders): ${lijst(b.bestaand)}

Geef dit JSON-object:
{
  "titel": "korte Nederlandse naam",
  "keuken": "...",
  "gang": "voor" | "hoofd" | "na",
  "niveau": getal 1-5,
  "minuten": totale tijd,
  "kookpitten": maximaal tegelijk gebruikte pitten,
  "vooraf": null, of kort zoals "2 uur in de koelkast" als het van tevoren gemaakt moet worden,
  "apparatuur": [alleen sleutels uit: ${lijst(b.gereiSleutels)}],
  "voorraad": [gebruikte basisproducten, alleen sleutels uit: ${lijst(b.voorraadSleutels)}],
  "ingredienten": [
    {"naam": "Penne", "hoeveelheid": 100, "eenheid": "g" | "ml" | "st",
     "afdeling": één van: ${lijst(b.afdelingen)},
     "verpakking": gangbare Albert Heijn-verpakkingsgrootte in dezelfde eenheid (bij "st": aantal per verpakking, 1 als je het los koopt),
     "glutenvrij": false als het gluten bevat (anders weglaten),
     "koolhydraatarm": false als het veel koolhydraten bevat (anders weglaten),
     "checkGluten": true als er vaak verborgen gluten in zitten, zoals bouillon of kant-en-klare saus,
     "allergenen": [allergenen in dit ingrediënt, sleutels uit: ${lijst(b.allergeenSleutels)}; lege lijst als er geen zijn]}
  ],
  "stappen": [
    {"tekst": "korte instructie, maximaal 2 zinnen",
     "uitleg": "hoe je het doet, voor een beginner (optioneel)",
     "timer_sec": getal of weglaten,
     "timer_label": "max 2 woorden",
     "thermomix": {"tijd": "5 sec", "temp": "100 °C" of "Varoma" of weglaten, "snelheid": "1" t/m "10" of "lepel", "linksom": true/false} alleen bij Thermomix-stappen}
  ]
}

Regels:
- Hoeveelheden zijn voor één gemiddelde portie. De app rekent zelf om naar het aantal eters.
- In "tekst" verwijs je naar ingrediënten met {0}, {1} enz. (index in de ingrediëntenlijst). De app vult dan de juiste hoeveelheid en naam in. Voor water gebruik je {=250 ml}, dat schaalt mee.
- Zet olie, zout, peper, knoflook, boter, suiker en droge kruiden niet bij ingrediënten maar bij voorraad, als ze in de sleutellijst staan. Noem ze in de stappen gewoon bij naam met een hoeveelheid zoals "1 eetlepel olie".
- Gewone gerechten met ingrediënten die bij Albert Heijn te koop zijn. Geen alcohol, geen rauwe eieren.
- 4 tot 9 stappen. Bij niveau 1 en 2 bij elke handeling een "uitleg".
- Thermomix TM5: maximaal 120 °C of Varoma, snelheid 1 tot 10 of lepel, linksom om te roeren zonder te snijden, mengkom maximaal 2,2 liter.
- Voeg een timer toe bij elke stap waarin je moet wachten.
- Schrijf alles in helder Nederlands.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.KOOKHULP_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ fout: 'Claude gaf een fout: ' + ((data.error && data.error.message) || r.status) });
    const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    const start = text.indexOf('{'), end = text.lastIndexOf('}');
    if (start < 0 || end < start) return res.status(502).json({ fout: 'Het antwoord was geen recept. Probeer het opnieuw.' });
    return res.status(200).json(JSON.parse(text.slice(start, end + 1)));
  } catch (e) {
    return res.status(502).json({ fout: 'Het recept kon niet worden gemaakt. Probeer het opnieuw.' });
  }
};
