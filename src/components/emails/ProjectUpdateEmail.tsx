import * as React from 'react';
import {
  Html,
  Body,
  Head,
  Heading,
  Hr,
  Container,
  Preview,
  Section,
  Text,
  Button,
} from '@react-email/components';

interface ProjectUpdateEmailProps {
  artistName: string;
  projectName: string;
  producerName: string;
  message: string;
  portalUrl: string;
}

export const ProjectUpdateEmail = ({
  artistName,
  projectName,
  producerName,
  message,
  portalUrl,
}: ProjectUpdateEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Actualización sobre tu proyecto: {projectName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Hola {artistName},</Heading>
          <Text style={text}>
            Hay novedades sobre tu proyecto <strong>{projectName}</strong> en el estudio de {producerName}.
          </Text>
          <Section style={messageBox}>
            <Text style={messageText}>{message}</Text>
          </Section>
          <Text style={text}>
            Puedes escuchar las últimas versiones y revisar el progreso directamente desde tu Portal de Cliente privado:
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={portalUrl}>
              Acceder a mi Portal
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            Enviado desde EZY Studio Platform.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
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

const messageBox = {
  background: '#f9f9f9',
  borderRadius: '8px',
  padding: '20px',
  margin: '20px 0',
  border: '1px solid #eaeaea',
};

const messageText = {
  color: '#444',
  fontSize: '15px',
  fontStyle: 'italic',
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

export default ProjectUpdateEmail;
