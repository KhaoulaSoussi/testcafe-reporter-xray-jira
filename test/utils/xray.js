const Request = require('request');

require('dotenv').config();

let authToken = 'default';

  
    async function getTestExecutions () {
        var getTestExecutionsQueryString = `{\n    getTestExecutions(jql: "project ='${process.env.JIRA_PROJECT_KEY}'", limit: 100) {\n        total\n        start\n        limit\n        results {\n            issueId\n            jira(fields: ["summary"])\n        }\n    }\n}`;
        var getTestExecutionsResult = await this.sendRequestToXrayGraphQL(getTestExecutionsQueryString);
        var executionResults = getTestExecutionsResult.data.getTestExecutions.results;

        return executionResults;
    }
  
    async function getExistingExecutions (testExecutionName) {
        const testExecutions = await getTestExecutions();

        console.log('testExecutions: ', testExecutions);
        for (let i = 0; i < testExecutions.length; i++) {
            if (testExecutions[i].jira.summary == testExecutionName) 
                return testExecutions[i].issueId;
      
        }
        return 'not exists';
    }

    async function createTestExecution (environment, date) {
        var executionId = await getExistingExecutions(`Test Execution for ${environment} ${date}`);

        if (executionId == 'not exists') {
            var createTestExecutionQueryString = `mutation {\n    createTestExecution(\n        testIssueIds: []\n        testEnvironments: ["${environment}"]\n        jira: {\n            fields: { summary: "Test Execution for ${environment} ${date}", project: {key: "${process.env.JIRA_PROJECT_KEY}"} }\n        }\n    ) {\n        testExecution {\n            issueId\n            jira(fields: ["key"])\n        }\n        warnings\n        createdTestEnvironments\n    }\n}`;
            var createTestExecutionResult = await sendRequestToXrayGraphQL(createTestExecutionQueryString);

            executionId = createTestExecutionResult.data.createTestExecution.testExecution.issueId;
            return executionId;
        }
        return executionId;
    }

    async function addTestToTestExecution (testIssueId, executionIssueId) {
        var addTestsToTestExecutionQueryString = `mutation {\n    addTestsToTestExecution(\n        issueId: "${executionIssueId}",\n        testIssueIds: ["${testIssueId}"]\n    ) {\n        addedTests\n        warning\n    }\n}`;

        await sendRequestToXrayGraphQL(addTestsToTestExecutionQueryString);
    }

    async function getTestRun (testIssueID, executionIssueId) {
        var getTestRunQueryString = `{\n    getTestRun( testIssueId: "${testIssueID}", testExecIssueId: "${executionIssueId}") {\n        id\n        status {\n            name\n            color\n            description\n        }\n        gherkin\n        examples {\n            id\n            status {\n                name\n                color\n                description\n            }\n        }\n    }\n}`;
        var getTestRunResult = await sendRequestToXrayGraphQL(getTestRunQueryString);

        return getTestRunResult;
    }

    async function updateTestRunStatus (testRunId, testRunStatus) {
        var updateTestRunStatusQueryString = `mutation {\n    updateTestRunStatus( id: "${testRunId}", status: "${testRunStatus}")\n}`;
        var updateTestRunStatusResult = await sendRequestToXrayGraphQL(updateTestRunStatusQueryString);

        return updateTestRunStatusResult;
    }

    async function addCommentToTestRun (testRunId, testRunErrorMessage) {
        var addCommentQueryString = `mutation {\n    updateTestRunComment( id: "${testRunId}", comment: "${testRunErrorMessage}")\n}`;
        var addCommentResult = await sendRequestToXrayGraphQL(addCommentQueryString);

        return addCommentResult;
    }

    async function addEvidenceToTestRun (testRunId, evidenceFile, i) {
        var addEvidenceQueryString = `mutation {\n    addEvidenceToTestRun(\n        id: "${testRunId}",\n        evidence: [\n            {\n                filename: "evidence${i}.png"\n                mimeType: "text/plain"\n                data: "${evidenceFile}"\n            }\n        ]\n    ) {\n        addedEvidence\n        warnings\n    }\n}`;
        var evidenceResult = await sendRequestToXrayGraphQL(addEvidenceQueryString);

        return evidenceResult;
    }

    async function getIssueId (ticketId) {
        return new Promise((resolve, reject) => {
            Request.get({
                headers: { 'content-type': 'application/json', Authorization: `${process.env.JIRA_AUTH}` },
                url:     `${process.env.JIRA_BASE_URL}rest/api/3/issue/${ticketId}`,
            }, (error, response, body) => {
                if (error) 
                    reject(error);
        
                resolve(JSON.parse(body).id);
            });
        });
    }

    async function getAuthTokenForXray () {   
        return new Promise((resolve, reject) => {
            Request.post({
                headers: { 'Content-Type': 'application/json' },
                url:     'https://xray.cloud.getxray.app/api/v2/authenticate',
                body:    JSON.stringify({ client_id: `${process.env.XRAY_CLIENT_ID}`, client_secret: `${process.env.XRAY_CLIENT_SECRET}` }),
            }, (error, response, body) => {
                if (error) 
                    reject(error);
          
                resolve(JSON.parse(body));
            });
        });    
    }

    async function sendRequestToXrayGraphQL (queryString) {
        if (authToken == 'default') 
            authToken = await this.getAuthTokenForXray();
    
        return new Promise((resolve, reject) => {
            Request.post({
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                url:     'https://xray.cloud.getxray.app/api/v2/graphql',
                body:    JSON.stringify({ query: queryString }),
            }, (error, response, body) => {
                if (error) 
                    reject(error);
        
                resolve(JSON.parse(body));
            });
        });
    }


