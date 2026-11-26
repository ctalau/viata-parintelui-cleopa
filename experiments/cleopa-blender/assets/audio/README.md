# Tatăl nostru

Variantă scurtă de lucru pentru scenă.

> Tatăl nostru, Care ești în ceruri, sfințească-se numele Tău. Vie împărăția Ta. Facă-se voia Ta, precum în cer, așa și pe pământ. Pâinea noastră cea de toate zilele dă-ne-o nouă astăzi. Și ne iartă nouă greșelile noastre, precum și noi iertăm greșiților noștri. Și nu ne duce pe noi în ispită, ci ne izbăvește de cel rău. Amin.

## Sincronizare

Preotul conduce rugăciunea. Gurile personajelor folosesc chei provizorii pentru previzualizarea mută.

1. Importă o înregistrare autorizată, preferabil WAV la 48 kHz, într-o pistă Sound din Video Sequencer. Așază începutul rugăciunii în jurul cadrului 121 la 24 fps.
2. Ascultă înregistrarea și notează poziția silabelor. În Action Editor, ajustează cheile proprietății `mouth_pose` de pe armatură. Valorile sunt 0 pentru repaus, 1 pentru A, 2 pentru E/I, 3 pentru O/U, 4 pentru M/B/P, 5 pentru F/V, 6 pentru L și 7 pentru zâmbet. Copiii și părinții rostesc numai fragmente și spun Amin împreună cu preotul.
3. Dacă audio depășește cele 456 de cadre ale rugăciunii provizorii, extinde intervalul, mută blocurile Amen și crucea finală și actualizează reperele din `animations/timing.json`. Păstrează ordinea contactelor și decalajele.
4. După verificarea animației, randează din nou și mapează WAV-ul în exportul MP4 ca AAC. Verifică alinierea începutului și finalului la redare.
