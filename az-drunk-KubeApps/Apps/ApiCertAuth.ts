import { DefaultAksArgs } from '../../_Shared/KubeX/types';
import Deployment from '../../_Shared/KubeX/Deployment';
import { defaultConfig } from '../../_Shared/Common/AppConfigs/dotnetConfig';
import { envDomain } from '../../_Shared/Common/AzureEnv';

interface Props extends Omit<DefaultAksArgs, 'name'> {
  clientThumbprints?: Array<{ thumbprint: string; roles: string[] }>;
}

export default async ({ namespace, provider, clientThumbprints }: Props) => {
  const name = 'api-cert-auth';
  const image = 'baoduy2412/api-cert-auth';

  const config: any = {};

  clientThumbprints?.forEach((c) => {
    config['Authentication__CertAuth__Thumbprint'] = c.thumbprint;
    c.roles.forEach(
      (r, index) => (config[`Authentication__CertAuth__Roles__${index}`] = r)
    );
  });

  return await Deployment({
    name,
    namespace,
    provider,

    configMap: {
      ...defaultConfig,
      ...config,
    },

    podConfig: {
      port: 8080,
      image,
      podSecurityContext: { readOnlyRootFilesystem: true },
    },

    deploymentConfig: {
      replicas: 1,
      useVirtualHost: false,
    },

    ingressConfig: {
      certManagerIssuer: true,
      hostNames: [`${name}.${envDomain}`],
      auth: {
        enableClientTls: true,
        caSecret: 'dev/tls-api-cert-auth-drunkcoding-net-lets',
      },
    },

    enableHA: { maxReplicas: 3 },
  });
};
