import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildValidatedLoopbackUrl,
  isLoopbackHost,
  normalizeLoopbackHost,
  parseLoopbackUrl,
  validateLoopbackPort,
} from '../src/platform/loopback.js';
import { normalizeLanguage, resolveLanguage, translate } from '../src/cli/i18n.js';

test('loopback host, port, and URL validators accept only canonical local endpoints', () => {
  assert.equal(normalizeLoopbackHost('127.0.0.9'), '127.0.0.9');
  assert.equal(normalizeLoopbackHost('[::1]'), '::1');
  assert.equal(isLoopbackHost('localhost'), true);
  for (const host of ['0.0.0.0', '192.168.1.2', 'router.local', '::']) {
    assert.equal(isLoopbackHost(host), false);
    assert.throws(() => normalizeLoopbackHost(host), /Invalid loopback host/);
  }
  assert.equal(validateLoopbackPort('15721'), 15721);
  assert.throws(() => validateLoopbackPort(0), /Invalid loopback port/);
  assert.throws(() => validateLoopbackPort(65536), /Invalid loopback port/);
  assert.equal(buildValidatedLoopbackUrl('::1', 15721), 'http://[::1]:15721');
  assert.deepEqual(parseLoopbackUrl('http://127.0.0.1:15721'), {
    origin: 'http://127.0.0.1:15721',
    host: '127.0.0.1',
    port: 15721,
  });
  for (const url of [
    'https://127.0.0.1:15721',
    'http://127.0.0.1',
    'http://127.0.0.1:15721/path',
    'http://127.0.0.1:15721?next=example.com',
    'http://user@127.0.0.1:15721',
    'http://192.168.1.2:15721',
  ]) {
    assert.throws(() => parseLoopbackUrl(url), /loopback|canonical|explicit port/i);
  }
});

test('language helpers normalize locale tags and fall back safely', () => {
  assert.equal(normalizeLanguage('FR_ch'), 'fr');
  assert.equal(normalizeLanguage('es'), null);
  assert.equal(resolveLanguage(null, { LANG: 'de_CH.UTF-8' }), 'de');
  assert.equal(resolveLanguage('invalid', {}), 'en');
  assert.equal(translate('fr', 'chooseTool'), 'Choisissez un outil :');
  assert.equal(translate('de', 'unknownKey'), 'unknownKey');
});
