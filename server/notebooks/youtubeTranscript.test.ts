import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVideoId, parseWatchPage, pickCaptionTrack, parseJson3Transcript } from './youtubeTranscript.js';

test('extractVideoId reconnaît les formats courants', () => {
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://www.youtube.com/watch?list=PL1&v=dQw4w9WgXcQ&t=42'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ?si=abc'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), null);
});

test('parseWatchPage lit les pistes et le titre, même avec des crochets dans les chaînes', () => {
  const html = `<script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[`
    + `{"baseUrl":"https://www.youtube.com/api/timedtext?v=x\\u0026lang=en","languageCode":"en","kind":"asr","name":{"simpleText":"English [auto]"}},`
    + `{"baseUrl":"https://www.youtube.com/api/timedtext?v=x\\u0026lang=fr","languageCode":"fr","name":{"simpleText":"Français"}}`
    + `]}},"videoDetails":{"videoId":"x","title":"Conférence \\"IA\\" 2026","thumbnail":{"thumbnails":[{"url":"u"}]},"author":"Studio Nova"}};</script>`;
  const { tracks, title, author } = parseWatchPage(html);
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].baseUrl, 'https://www.youtube.com/api/timedtext?v=x&lang=en');
  assert.equal(title, 'Conférence "IA" 2026');
  assert.equal(author, 'Studio Nova');
});

test('parseWatchPage sans sous-titres', () => {
  assert.deepEqual(parseWatchPage('<html>rien</html>').tracks, []);
});

test('pickCaptionTrack préfère la langue demandée, puis le manuel à l\'automatique', () => {
  const tracks = [
    { baseUrl: 'a', languageCode: 'en', kind: 'asr' },
    { baseUrl: 'b', languageCode: 'fr-FR', kind: 'asr' },
    { baseUrl: 'c', languageCode: 'fr' },
    { baseUrl: 'd', languageCode: 'de' },
  ];
  assert.equal(pickCaptionTrack(tracks)?.baseUrl, 'c');
  assert.equal(pickCaptionTrack(tracks, ['en'])?.baseUrl, 'a');
  assert.equal(pickCaptionTrack(tracks, ['es'])?.baseUrl, 'c');
  assert.equal(pickCaptionTrack([]), null);
});

test('parseJson3Transcript assemble le texte en paragraphes', () => {
  const sentence = 'Le marché des assistants IA croît très vite cette année.';
  const events = Array.from({ length: 30 }, () => ({ segs: [{ utf8: sentence.slice(0, 20) }, { utf8: sentence.slice(20) }] }));
  const text = parseJson3Transcript({ events: [{ segs: [{ utf8: '\n' }] }, ...events] });
  assert.ok(text.startsWith('Le marché des assistants'));
  assert.ok(text.includes('\n\n'), 'devrait contenir plusieurs paragraphes');
  assert.ok(!text.includes('  '));
});
