import { DefaultAksArgs } from '../../_Shared/KubeX/types';
import Deployment from '../../_Shared/KubeX/Deployment';
import { defaultConfig } from '../../_Shared/Common/AppConfigs/dotnetConfig';
import { envDomain } from '../../_Shared/Common/AzureEnv';

interface Props extends Omit<DefaultAksArgs, 'name'> {
  version?: string;
}

export default async ({ namespace, provider, version }: Props) => {
  const name = 'api-cert-auth';
  const nameWithVersion = version ? `${name}-${version}` : name;
  const image = 'baoduy2412/api-cert-auth';

  return await Deployment({
    name: nameWithVersion,
    namespace,
    provider,

    configMap: {
      ...defaultConfig,
      AppName: `The application version ${version || 'master'}`,
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
      canary: version
        ? { headerKey: 'X-App-Version', headerValue: version }
        : undefined,
    },

    enableHA: { maxReplicas: 3 },
  });
};
