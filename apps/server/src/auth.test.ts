import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthStore, COOKIE_NAME, clearCookie, cookieValue, sessionCookie } from './auth.ts';

const CLIENT = '127.0.0.1';
const TTL = 60_000;

function store() {
  return new AuthStore('s3cret', TTL);
}

describe('AuthStore', () => {
  it('mints a session that validates for the correct token', () => {
    const auth = store();
    const result = auth.login(CLIENT, 's3cret');
    assert.equal(result.outcome, 'ok');
    assert.ok(result.session);
    assert.notEqual(auth.validate(result.session.id), null);
  });

  it('mints nothing for a wrong token', () => {
    const auth = store();
    const result = auth.login(CLIENT, 'wrong');
    assert.equal(result.outcome, 'bad_token');
    assert.equal(result.session, undefined);
  });

  it('rejects an unknown session id', () => {
    assert.equal(store().validate('not-a-session'), null);
  });

  it('rejects a missing session id', () => {
    assert.equal(store().validate(undefined), null);
  });

  it('invalidates immediately on revoke', () => {
    const auth = store();
    const { session } = auth.login(CLIENT, 's3cret');
    assert.ok(session);
    auth.revoke(session.id);
    assert.equal(auth.validate(session.id), null);
  });

  it('rejects an expired session', () => {
    const auth = new AuthStore('s3cret', 0);
    const { session } = auth.login(CLIENT, 's3cret');
    assert.ok(session);
    assert.equal(auth.validate(session.id), null);
  });

  it('trips the rate limiter after repeated failures, correct token included', () => {
    const auth = store();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.equal(auth.login(CLIENT, 'wrong').outcome, 'bad_token');
    }
    assert.equal(auth.login(CLIENT, 's3cret').outcome, 'rate_limited');
  });

  it('rate limits per client address', () => {
    const auth = store();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      auth.login(CLIENT, 'wrong');
    }
    assert.equal(auth.login('10.0.0.9', 's3cret').outcome, 'ok');
  });

  it('clears the failure count after a success', () => {
    const auth = store();
    for (let attempt = 0; attempt < 9; attempt += 1) {
      auth.login(CLIENT, 'wrong');
    }
    assert.equal(auth.login(CLIENT, 's3cret').outcome, 'ok');
    for (let attempt = 0; attempt < 9; attempt += 1) {
      auth.login(CLIENT, 'wrong');
    }
    assert.equal(auth.login(CLIENT, 's3cret').outcome, 'ok');
  });

  it('issues distinct session ids', () => {
    const auth = store();
    const a = auth.login(CLIENT, 's3cret').session;
    const b = auth.login(CLIENT, 's3cret').session;
    assert.ok(a && b);
    assert.notEqual(a.id, b.id);
    assert.equal(a.id.length, 64);
  });

  it('accepts anything when authentication is disabled', () => {
    const auth = new AuthStore(null, TTL);
    assert.equal(auth.authRequired, false);
    assert.equal(auth.login(CLIENT, '').outcome, 'ok');
    assert.notEqual(auth.validate('anything'), null);
  });

  it('drops expired entries when swept', () => {
    const auth = new AuthStore('s3cret', 0);
    const { session } = auth.login(CLIENT, 's3cret');
    assert.ok(session);
    auth.sweep();
    assert.equal(auth.validate(session.id), null);
  });
});

describe('cookies', () => {
  it('parses one value out of a multi-value header', () => {
    const header = 'theme=dark; websh_session=abc123; other=1';
    assert.equal(cookieValue(header, COOKIE_NAME), 'abc123');
    assert.equal(cookieValue(header, 'missing'), undefined);
    assert.equal(cookieValue(undefined, COOKIE_NAME), undefined);
  });

  it('marks the session cookie HttpOnly and SameSite=Strict', () => {
    const cookie = sessionCookie('abc', TTL, false);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.doesNotMatch(cookie, /Secure/);
  });

  it('adds Secure only when asked', () => {
    assert.match(sessionCookie('abc', TTL, true), /Secure/);
    assert.match(clearCookie(true), /Secure/);
  });

  it('expires the cookie when clearing', () => {
    assert.match(clearCookie(false), /Max-Age=0/);
  });
});
