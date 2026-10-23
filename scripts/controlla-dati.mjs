// Blocca l'inserimento di dati reali nel repository pubblico: ZIP, PDF, immagini e JSON
// sono ammessi solo nelle cartelle di esempi fittizi, icone, font e fixture dei test.
import { execSync } from 'node:child_process';
const file = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const ammessi = [/^esempi\//, /^public\/(icone|fonts)\//, /^tests\/fixture\//, /^schema\/.*\.schema\.json$/, /^(package|package-lock|tsconfig)\.json$/, /^docs\//];
const sospetti = /\.(zip|pdf|jpe?g|png|heic|json|xlsx?|docx?|m4a|mp3|webm)$/i;
const problemi = file.filter((f) => (sospetti.test(f) && !ammessi.some((r) => r.test(f))) || (/SOPRALLUOGO_/.test(f) && !/^esempi\//.test(f)));
if (problemi.length) {
  console.error('File non ammessi nel repository pubblico (possibili dati reali):\n' + problemi.join('\n'));
  process.exit(1);
}
console.log(`Controllo dati: ${file.length} file, nessun dato reale.`);
