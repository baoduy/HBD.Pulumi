import * as k8s from '@pulumi/kubernetes';
import { Input, Resource } from '@pulumi/pulumi';
import { NginxIngress } from '../_Shared/KubeX/Ingress';
import { envDomain } from '../_Shared/Common/AzureEnv';

interface Props {
  namespace: Input<string>;
  provider: k8s.Provider;
  dependsOn?: Input<Input<Resource>[]> | Input<Resource>;
}

export default ({ namespace, provider, dependsOn }: Props) => {
  const cors = { origins: ['*'], headers: ['*'] };
  const responseHeaders = {
    'Content-Security-Policy': `default-src 'self' https://*.singa.solutions https://localhost:44475 *.com data: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self' *.com`,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
  };

  NginxIngress({
    name: 'singa-portal',
    className: 'nginx',
    hostNames: [`portal.singa.solutions`, `admin.singa.solutions`],
    cors,
    responseHeaders,
    certManagerIssuer: true,
    tlsSecretName: 'tls-portal-lets',
    service: {
      metadata: { name: 'singa-portal', namespace },
      spec: { ports: [{ port: 80, targetPort: 80 }] },
    },
    provider,
    dependsOn,
  });

  NginxIngress({
    name: 'singa-bms',
    className: 'nginx',
    hostNames: [`bms.singa.solutions`],
    cors,
    responseHeaders,
    certManagerIssuer: true,
    tlsSecretName: 'tls-bms-lets',
    service: {
      metadata: { name: 'singa-bms-api', namespace },
      spec: { ports: [{ port: 80, targetPort: 80 }] },
    },
    provider,
    dependsOn,
  });
};
