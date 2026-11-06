import { withGwaWa } from '../../src/lib/koreanParticle.js';

const cases = [['할머니', '와'], ['어르신', '과'], ['ABC', '과']];
for (const [word, expected] of cases) {
    const actual = withGwaWa(word);
    if (actual !== expected) throw new Error(`${word}: expected ${expected}, got ${actual}`);
}
console.log('PASS koreanParticle', cases.length);
