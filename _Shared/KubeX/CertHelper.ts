import * as forge from 'node-forge';
import * as os from 'os';

const getChilkatTool = () => {
  const v = process.version.split('.')[0].replace('v', '');
  const node = v ? `node${v}` : 'node14';

  if (os.platform() == 'win32') {
    if (os.arch() == 'ia32') {
      return require(`@chilkat/ck-${node}-win-ia32`);
    } else {
      return require(`@chilkat/ck-${node}-win64`);
    }
  } else if (os.platform() == 'linux') {
    if (os.arch() == 'arm') {
      return require(`@chilkat/ck-${node}-arm`);
    } else if (os.arch() == 'x86') {
      return require(`@chilkat/ck-${node}-linux32`);
    } else {
      return require(`@chilkat/ck-${node}-linux64`);
    }
  } else if (os.platform() == 'darwin') {
    return require(`@chilkat/ck-${node}-macosx`);
  }
};

interface Props {
  pfxBase64: string;
  password: string | undefined;
  includeAll?: boolean;
}

export function convertPfxToPem({ pfxBase64, password, includeAll }: Props) {
  const pfx = getChilkatTool().Pfx();

  const success = pfx.LoadPfxEncoded(pfxBase64, 'Base64', password || '');
  if (success !== true) {
    console.log(pfx.LastErrorText);
    return undefined;
  }

  const keyCount: number = pfx.NumPrivateKeys;
  const certCount: number = pfx.NumCerts;

  const keys = new Array<string>();
  const clientCerts = new Array<string>();
  const serverCerts = new Array<string>();
  const caCerts = new Array<string>();

  const originalKeys = new Array<any>();
  const originalClientCerts = new Array<any>();
  const originalServerCerts = new Array<any>();
  const originalCaCerts = new Array<any>();

  //Keys
  for (let i = 0; i < keyCount; i++) {
    keys.push(pfx.GetPrivateKey(i).GetPkcs8Pem());
  }

  for (let i = 0; i < certCount; i++) {
    const c = pfx.GetCert(i);

    if (includeAll) {
      clientCerts.push(c.ExportCertPem());
      originalClientCerts.push(c);
      continue;
    }

    if (
      c.ForClientAuthentication &&
      !(c.SubjectCN.includes('CA') || c.SubjectCN.includes('Validation'))
    ) {
      clientCerts.push(c.ExportCertPem());
      originalClientCerts.push(c);
    }
    if (c.ForServerAuthentication) {
      //console.log(c);
      serverCerts.push(c.ExportCertPem());
      originalServerCerts.push(c);
    }

    if (
      (!c.ForClientAuthentication && !c.ForServerAuthentication) ||
      c.SubjectCN.includes('CA') ||
      c.SubjectCN.includes('Validation')
    ) {
      caCerts.push(c.ExportCertPem());
      originalCaCerts.push(c);
    }
  }

  return {
    key: keys.join(''),
    cert: clientCerts.join(''),
    ca: caCerts.join(''),
    server: serverCerts.join(''),
    clientCerts,
    serverCerts,
    keys,
    caCerts,
    originalCaCerts,
    originalClientCerts,
    originalKeys,
    originalServerCerts,
  };
}

export const DecodeBase64Cert = (pfxBase64: string) =>
  forge.util.decode64(pfxBase64);
