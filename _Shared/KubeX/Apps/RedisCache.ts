import { DefaultAksArgs } from '../types';
import { KeyVaultInfo } from '../../types';
import { randomPassword } from '../../Core/Random';
import { StorageClassNameTypes } from '../Storage';
import { addCustomSecret } from '../../KeyVault/CustomHelper';
import { getPasswordName } from '../../Common/Naming';
import { envDomain } from '../../Common/AzureEnv';
import { interpolate } from '@pulumi/pulumi';
import Deployment from '../Deployment';
import { createPVCForStorageClass } from '../Storage';

interface Props extends DefaultAksArgs {
  version?: string;
  vaultInfo?: KeyVaultInfo;
  storageClassName?: StorageClassNameTypes;
}

export default async ({
  name,
  namespace,
  version = 'latest',
  vaultInfo,
  storageClassName,
  ...others
}: Props) => {
  const password = randomPassword({
    name,
    length: 25,
    options: { special: false },
  }).result;

  if (vaultInfo) {
    await addCustomSecret({
      name: getPasswordName(name, null),
      vaultInfo,
      value: password,
      contentType: name,
    });
  }

  const persisVolume = storageClassName
    ? createPVCForStorageClass({
        name,
        namespace,
        ...others,
        storageClassName,
      })
    : undefined;

  const port = 6379;
  const redis = Deployment({
    name,
    namespace,
    ...others,
    secrets: { PASSWORD: password },
    podConfig: {
      port,
      image: `redis:${version}`,
      volumes: persisVolume
        ? [
            {
              name: 'redis-data',
              persistentVolumeClaim: persisVolume.metadata.name,
              mountPath: '/data',
            },
          ]
        : undefined,
    },
    deploymentConfig: {
      args: [interpolate`--requirepass ${password}`],
    },
    serviceConfig: { port },
  });

  return { redis, password, host: `redis.${envDomain}` };
};
