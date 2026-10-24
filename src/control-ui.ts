import { defineControlUiPlugin, type ControlUiView } from 'openclaw/plugin-sdk/control-ui';
import { Onboarding, SetupFailure, type ConnectionResult, type PendingStorage } from './onboarding.js';

export const mountSetup: ControlUiView = (container, context) => {
  const de = context.host.locale.toLowerCase().startsWith('de');
  const say = (german: string, english: string) => de ? german : english;
  const lifetime = new AbortController();
  const signal = AbortSignal.any([context.signal, lifetime.signal]);
  let recovery: PendingStorage | undefined;
  try { recovery = window.sessionStorage; } catch {}
  const root = document.createElement('section');
  root.style.cssText = 'max-width:640px;margin:32px auto;padding:28px;border:1px solid var(--border, #8885);border-radius:16px;background:var(--card, transparent);color:var(--text, inherit);font:inherit;box-sizing:border-box';
  const title = document.createElement('h1'); title.textContent = 'UniFi'; title.style.marginTop = '0';
  const intro = document.createElement('p'); intro.textContent = say('Token einfügen. Verbinden. Fertig.', 'Paste your token. Connect. Done.');
  const form = document.createElement('form');
  const label = document.createElement('label'); label.textContent = say('UniFi API-Token', 'UniFi API token'); label.htmlFor = 'unifi-token';
  const input = document.createElement('input');
  input.id = 'unifi-token'; input.name = 'unifi-token'; input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 4096;
  input.placeholder = say('Token hier einfügen', 'Paste token here');
  input.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:10px 0 16px;padding:12px;border:1px solid var(--border, #8888);border-radius:8px;background:var(--bg, transparent);color:inherit;font:inherit';
  const connect = document.createElement('button'); connect.type = 'submit'; connect.textContent = say('Verbinden', 'Connect'); connect.className = 'btn primary';
  const check = document.createElement('button'); check.type = 'button'; check.textContent = say('Verbindung prüfen', 'Check connection'); check.className = 'btn'; check.style.marginInlineStart = '10px';
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const flow = new Onboarding(context.host, signal, recovery, 'openclaw.unifi.setup.pending:' + context.host.basePath, stage => {
    if (signal.aborted) return;
    const messages = {
      configuration: say('Einrichtung wird vorbereitet …', 'Preparing setup …'),
      storage: say('Token wird geschützt gespeichert …', 'Saving token securely …'),
      activation: say('Token wird aktiviert …', 'Activating token …'),
      connection: say('UniFi-Verbindung wird geprüft (max. 8 Sekunden Netzwerkwartezeit) …', 'Checking UniFi connection (up to 8 seconds network wait) …'),
    };
    status.textContent = messages[stage];
  });
  const help = document.createElement('p'); help.style.cssText = 'font-size:.9em;opacity:.8;line-height:1.5';
  help.textContent = say('Geschützte Speicherung und Einrichtung erfolgen automatisch. Der Verbindungstest liest nur Daten und ändert dein Netzwerk nicht.', 'Protected storage and configuration are automatic. The connection test only reads data and does not change your network.');
  const keyLink = document.createElement('a'); keyLink.href = 'https://unifi.ui.com/'; keyLink.target = '_blank'; keyLink.rel = 'noopener noreferrer'; keyLink.textContent = say('API-Token in UniFi Site Manager erstellen', 'Create an API token in UniFi Site Manager');
  const live = () => !signal.aborted && !disposed;
  let busy = false;
  let generation = 0;
  let disposed = false;
  const updatePermissions = () => { if (!context.host.connection.canAdmin || !context.host.connection.connected) input.value = ''; input.disabled = busy || !context.host.connection.canAdmin || !context.host.connection.connected; connect.disabled = input.disabled; check.disabled = busy || !context.host.connection.canRead || !context.host.connection.connected; };
  const show = (r: ConnectionResult) => {
    if (r.connected) status.textContent = say('Verbunden. Der UniFi-Zugriff ist bestätigt; das Plugin ist einsatzbereit.', 'Connected. UniFi access is verified; the plugin is ready.');
    else if (r.code === 'configuration_not_active') status.textContent = say('Token gespeichert, Aktivierung steht noch aus. Bitte Verbindung erneut prüfen, sobald OpenClaw die Aktivierung abgeschlossen hat.', 'Token saved, activation is still pending. Check the connection again once OpenClaw has finished activation.');
    else if (r.code === 'timeout') status.textContent = say('UniFi antwortet nicht rechtzeitig. Der Token bleibt gespeichert; bitte Verbindung erneut prüfen.', 'UniFi did not respond in time. Your token remains saved; check the connection again.');
    else if (r.status === 429) status.textContent = say('UniFi begrenzt gerade die Anfragen. Bitte später erneut prüfen; der Token bleibt gespeichert.', 'UniFi is rate-limiting requests. Check again later; your token remains saved.');
    else if (r.status === 401 || r.status === 403) status.textContent = say('Token gespeichert, aber UniFi verweigert den Zugriff. Bitte Token und seine Berechtigungen prüfen.', 'Token saved, but UniFi denied access. Check the token and its permissions.');
    else if (!r.configured) status.textContent = say('Noch nicht verbunden. Füge deinen UniFi API-Token ein.', 'Not connected yet. Paste your UniFi API token.');
    else status.textContent = say('Token eingerichtet. Die Verbindung konnte noch nicht bestätigt werden. Bitte Verbindung prüfen oder Token ersetzen.', 'Token configured. Connection could not be confirmed. Check the connection or replace the token.');
  };
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !context.host.connection.canAdmin) return;
    generation++; busy = true; updatePermissions(); status.textContent = say('Wird geschützt gespeichert und verbunden …', 'Saving securely and connecting …');
    let token = input.value; input.value = '';
    try {
      const pending = flow.connect(token, context.host.connection.canAdmin); token = '';
      const result = await pending; if (live()) show(result);
    } catch (error) {
      if (!live()) return;
      const stage = error instanceof SetupFailure ? error.stage : 'connection';
      status.textContent = stage === 'token' ? say('Bitte einen gültigen Token ohne Leerzeichen eingeben.', 'Enter a valid token without whitespace.') : stage === 'permission' ? say('Zum Verbinden ist Administratorzugriff erforderlich.', 'Administrator access is required to connect.') : stage === 'storage' ? say('Speicherung nicht bestätigt. Klicke erneut auf Verbinden, um den gespeicherten Stand zu prüfen; bei Bedarf den Token erneut eingeben.', 'Storage was not confirmed. Click Connect again to reconcile the saved entry; re-enter the token if needed.') : flow.canRetry ? say('Einrichtung noch nicht bestätigt. Klicke erneut auf Verbinden, um den gespeicherten Stand zu prüfen.', 'Setup not confirmed. Click Connect again to reconcile the saved entry.') : say('Verbindung nicht bestätigt. Bitte erneut prüfen.', 'Connection not confirmed. Please check again.');
    } finally { token = ''; if (live()) { busy = false; updatePermissions(); } }
  });
  check.addEventListener('click', async () => {
    if (busy) return; generation++; busy = true; updatePermissions(); status.textContent = say('Verbindung wird geprüft …', 'Checking connection …');
    try { const r = await flow.check(); if (live()) show(r); }
    catch { if (live()) status.textContent = say('Verbindungstest derzeit nicht verfügbar. Bitte erneut versuchen.', 'Connection check unavailable. Please try again.'); }
    finally { if (live()) { busy = false; updatePermissions(); } }
  });
  form.append(label, input, connect, check); root.append(title, intro, form, status, help, keyLink); container.append(root);
  const unsubscribe = context.host.subscribe(updatePermissions); updatePermissions();
  if (!context.host.connection.canAdmin) status.textContent = say('Zum Einrichten als Administrator anmelden.', 'Sign in as an administrator to set up.');
  else if (flow.canRetry) status.textContent = say('Unterbrochene Einrichtung gefunden. Klicke auf Verbinden, um sie fortzusetzen.', 'Interrupted setup found. Click Connect to resume.');
  else void context.host.request<ConnectionResult>('unifi.connection.status', {}).then(r => { if (live() && !busy && generation === 0) show(r); }).catch(() => { if (live() && !busy && generation === 0) status.textContent = say('Füge deinen UniFi API-Token ein.', 'Paste your UniFi API token.'); });
  return { focus() { input.focus(); }, dispose() { disposed = true; lifetime.abort(); input.value = ''; unsubscribe(); root.remove(); } };
};
export default defineControlUiPlugin({ id: 'unifi', activate(host) {
  const page = host.ui.registerPage({ id: 'setup', label: 'UniFi', mount: mountSetup });
  const nav = host.ui.registerNavigation({ id: 'setup', label: 'UniFi', page: { id: 'setup' }, icon: 'network', order: 60 });
  return () => { nav(); page(); };
} });
