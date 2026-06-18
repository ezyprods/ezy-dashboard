import * as React from 'react';
import {
  Html, Body, Head, Heading, Hr, Container, Preview, Section, Text, Button,
} from '@react-email/components';

interface MasterReadyEmailProps {
  artistName: string;
  songName: string;
  producerName: string;
  isUpdate: boolean;
  portalUrl?: string;
}

export const MasterReadyEmail = ({
  artistName,
  songName,
  producerName,
  isUpdate,
  portalUrl,
}: MasterReadyEmailProps) => {
  const subject = isUpdate
    ? `Master actualizado: ${songName}`
    : `Tu master está listo: ${songName}`;

  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Hola {artistName},</Heading>
          <Text style={text}>
            {isUpdate
              ? `El master de tu canción <strong>${songName}</strong> ha sido actualizado en el estudio de ${producerName}.`
              : `El master de tu canción <strong>${songName}</strong> está listo desde el estudio de ${producerName}.`
            }
          </Text>
          <Section style={badge}>
            <Text style={badgeText}>
              {isUpdate ? '🔄 Master Actualizado' : '✅ Master Listo'}
            </Text>
          </Section>
          <Text style={text}>
            Puedes escuchar la versión final y acceder a todos los archivos de tu proyecto desde tu portal privado:
          </Text>
          {portalUrl && (
            <Section style={buttonContainer}>
              <Button style={button} href={portalUrl}>
                Acceder a mi Portal
              </Button>
            </Section>
          )}
          <Hr style={hr} />
          <Text style={footer}>
            Enviado desde EZY Studio Platform. Este es un mensaje automático.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
  maxWidth: '580px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: '600',
  padding: '0',
  margin: '30px 0 15px',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
};

const badge = {
  background: '#f0f4ff',
  borderRadius: '8px',
  padding: '12px 20px',
  margin: '20px 0',
  border: '1px solid #d0d9f0',
  textAlign: 'center' as const,
};

const badgeText = {
  color: '#5e6ad2',
  fontSize: '18px',
  fontWeight: '700',
  margin: '0',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '30px 0',
};

const button = {
  backgroundColor: '#5e6ad2',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 24px',
};

const hr = {
  borderColor: '#cccccc',
  margin: '40px 0 20px',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
};

export default MasterReadyEmail;
