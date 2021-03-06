import { getAppInsightName, getResourceGroupName } from '../Naming';
import { ResourceInfo } from '../../types';
import { defaultLocation, subscriptionId } from '../AzureEnv';
import { interpolate } from '@pulumi/pulumi';

export const name = 'Share';
export const resourceGroupName = getResourceGroupName(name);
export const logResourceGroupName = getResourceGroupName(`${name}-logs`);

const insightName = getAppInsightName(name);
export const insightInfo: ResourceInfo = {
  resourceName: insightName,
  group: { resourceGroupName: logResourceGroupName, location: defaultLocation },
  id: interpolate`/subscriptions/${subscriptionId}/resourceGroups/${logResourceGroupName}/providers/Microsoft.Insights/components/${insightName}`,
};
