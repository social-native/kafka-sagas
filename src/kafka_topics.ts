export const topics = {
    cloneCampaign: {
        start: 'CLONE_CAMPAIGN_START',
        success: 'CLONE_CAMPAIGN_SUCCESS',
        failure: 'CLONE_CAMPAIGN_FAILURE'
    },
    copyCampaign: {
        start: 'COPY_CAMPAIGN_START',
        success: 'COPY_CAMPAIGN_SUCCESS',
        failure: 'COPY_CAMPAIGN_FAILURE'
    },
    copyProductions: {
        start: 'COPY_PRODUCTIONS_START',
        success: 'COPY_PRODUCTIONS_SUCCESS',
        failure: 'COPY_PRODUCTIONS_FAILURE'
    },
    copyDirections: {
        start: 'COPY_DIRECTIONS_START',
        success: 'COPY_DIRECTIONS_SUCCESS',
        failure: 'COPY_DIRECTIONS_FAILURE'
    }
};
export const generateTopicForSpecificTransaction = (transactionId: string, topic: string) => {
    return `saga-tx-${transactionId}-${topic}`;
};
export const generateTopicForAnytransaction = (topic: string) => {
    return `saga-tx-.+-(${topic}$)`;
};
