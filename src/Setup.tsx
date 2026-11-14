import { FormEvent, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import './App.css';
import DisboxFileManager from './disbox-file-manager';
import NavigationBar from './NavigationBar';

function Setup() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onContinue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = document.getElementById('webhookUrl') as HTMLInputElement | null;
    const webhookUrl = String(input?.value || '').trim();
    if (!webhookUrl) {
      setError('Please paste your Discord webhook URL.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await DisboxFileManager.create(webhookUrl);
      localStorage.setItem('webhookUrl', webhookUrl);
      navigate('/');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <NavigationBar />
      <div className="App App-header" style={{ color: 'black' }}>
        <div
          style={{
            backgroundColor: '#FCFCFC',
            width: '66%',
            minHeight: '90vh',
            paddingBottom: '2rem',
          }}
        >
          <h1 style={{ fontSize: '6rem' }} className="mt-3">
            <b>Setup</b>
          </h1>
          <h1 style={{ fontSize: '2rem' }}>
            <b>Just a few steps and we&apos;re ready to go.</b>
          </h1>
          <div
            style={{ fontSize: '1.5rem', textAlign: 'left', width: '80%', margin: '2rem auto' }}
            className="mt-4"
          >
            <b style={{ color: '#555555' }}>1.</b> Open a{' '}
            <a href="https://discord.com/app" target="_blank" rel="noopener noreferrer">
              Discord
            </a>{' '}
            account, if you don&apos;t already have one.
            <div style={{ height: '1rem' }} />
            <b style={{ color: '#555555' }}>2.</b> Open a new server. Don&apos;t share this server
            with anyone, as it will be used to store your files.
            <div style={{ height: '1rem' }} />
            <b style={{ color: '#555555' }}>3.</b> Open <b>Server Settings</b> from the top left
            menu, select <b>Integrations</b> and click <b>Create Webhook</b>.
            <div style={{ height: '1rem' }} />
            <b style={{ color: '#555555' }}>4.</b> Copy the URL of the webhook you just created by
            clicking on the <b>Copy Webhook URL</b> button.
            <div style={{ height: '1rem' }} />
            This URL is used as the key to your Disbox storage and provides access to your files, so
            don&apos;t share it with anyone. You can always copy it again later from the
            Integrations menu.
            <div style={{ height: '1rem' }} />
            <b style={{ color: '#555555' }}>5.</b> Paste your URL here:
          </div>
          <Form onSubmit={onContinue}>
            <Form.Group>
              <Form.Control
                id="webhookUrl"
                type="password"
                placeholder="Webhook URL"
                style={{ width: '80%', margin: 'auto', fontSize: '1.5rem' }}
                autoComplete="off"
              />
            </Form.Group>
            {error && (
              <Alert variant="danger" style={{ width: '80%', margin: '1rem auto 0' }}>
                {error}
              </Alert>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              style={{ width: '80%', margin: 'auto', marginTop: '1rem', fontSize: '1.5rem' }}
            >
              {loading ? (
                <>
                  <Spinner animation="border" size="sm" /> Connecting...
                </>
              ) : (
                <b>Continue</b>
              )}
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}

export default Setup;
