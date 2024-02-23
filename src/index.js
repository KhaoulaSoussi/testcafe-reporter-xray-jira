var xray = require('../test/utils/xray');

require('dotenv').config();

let executionId;

let os;

let browser;

let date;

let osType;

let env;

module.exports = function () {
    return {
        noColors:       false,
        startTime:      null,
        afterErrorList: false,
        testCount:      0,
        skipped:        0,

        async reportTaskStart (startTime, userAgents, testCount) {
            this.startTime = startTime;
            this.testCount = testCount;

            date = startTime.toString().split(' ');
            browser = userAgents[0].split(' ')[0];
            os = userAgents[0].split('/')[1];

            // Create Test Execution
            if (os.includes('mac') || os.includes('OS X')) {
                osType = 'Mac';
                env = `${browser}`;
            }
            else if (os.includes('Windows')) {
                osType = 'Windows';
                env = `${browser}`;
            }
            else if (os.includes('iOS') || os.includes('Android')) {
                var deviceName = process.env['MOBILE_DEVICE_NAME'];

                osType = os.includes('iOS') ? 'ios' : 'android';
                env = `${deviceName} ${browser}`;
            }
            else env = `${browser}`;

            const day = `${date[1]}-${date[2]}-${date[3]} ${date[4]}`;

            executionId = await xray.createTestExecution(osType, env, day);

            // write to console
            this.setIndent(1)
                .useWordWrap(true)
                .write(this.chalk.bold('Running tests in:'))
                .newline();

            userAgents.forEach((ua) => {
                this.write(`- ${this.chalk.blue(ua)}`).newline();
            });
        },

        async reportFixtureStart (name, path, meta) {
            this.currentFixtureName = name;
            this.setIndent(1).useWordWrap(true);

            if (this.afterErrorList) this.afterErrorList = false;
            else this.newline();

            this.write(name).newline();
        },

        async reportTestStart (/* name, meta */) {},

        async reportTestDone (name, testRunInfo, meta) {
            // write the test run info to the console
            var hasErr = !!testRunInfo.errs.length;
            var symbol = null;
            var nameStyle = null;

            if (testRunInfo.skipped) {
                this.skipped++;

                symbol = this.chalk.cyan('-');
                nameStyle = this.chalk.cyan;
            }
            else if (hasErr) {
                symbol = this.chalk.red.bold(this.symbols.err);
                nameStyle = this.chalk.red.bold;
            }
            else {
                symbol = this.chalk.green(this.symbols.ok);
                nameStyle = this.chalk.grey;
            }

            var title = `${symbol} ${nameStyle(name)}`;

            this.setIndent(1).useWordWrap(true);

            if (testRunInfo.unstable) title += this.chalk.yellow(' (unstable)');

            if (testRunInfo.screenshotPath) {
                title += ` (screenshots: ${this.chalk.underline.grey(
                    testRunInfo.screenshotPath
                )})`;
            }

            this.write(title);

            if (hasErr) this._renderErrors(testRunInfo.errs);

            this.afterErrorList = hasErr;

            this.newline();
            // export to xray
            const errors = testRunInfo.errs;
            const hasErrors = !!errors.length;
            const result = hasErrors ? 'failed' : 'passed';

            // Get JIRA issue Id for the Test
            const testKey = name.split(' ')[0];
            const testIssueId = await xray.getIssueId(testKey);
            var getTestRunData = await xray.getTestRun(
                testIssueId,
                executionId
            );
            var testRunId;

            if (getTestRunData.data.getTestRun != null)
                testRunId = getTestRunData.data.getTestRun.id;
            else {
                await xray.addTestToTestExecution(testIssueId, executionId);
                getTestRunData = await xray.getTestRun(
                    testIssueId,
                    executionId
                );
                testRunId = getTestRunData.data.getTestRun.id;
            }

            // Get Test Execution result
            var testRunStatus = '';

            if (result == 'failed') testRunStatus = 'FAILED';
            else if (testRunInfo.skipped) testRunStatus = 'SKIPPED';
            else testRunStatus = 'PASSED';

            // Update the Test Run
            await xray.updateTestRunStatus(testRunId, testRunStatus);

            // Get Error message if failed
            var testRunError = '';
            var errorsInfo = testRunInfo.errs;

            if (testRunStatus == 'FAILED') {
                errorsInfo.forEach(function (error) {
                    testRunError += error.errMsg;
                });
            }

            // Add artifacts for Failures
            if (testRunStatus == 'FAILED') {
                // Add Error message as comments to Test Run
                await xray.addCommentToTestRun(testRunId, testRunError);

                // Add Evidence Screenshots to Test Run
                for (let i = 1; i <= testRunInfo.screenshots.length; i++) {
                    var imagePaths =
                        testRunInfo.screenshots[i - 1].screenshotPath;
                    var imageData = await xray.base64_encode(imagePaths);

                    await xray.addEvidenceToTestRun(testRunId, imageData, i);
                }
            }
        },

        async reportTaskDone (endTime, passed, warnings) {
            var durationMs = endTime - this.startTime;
            var durationStr = this.moment
                .duration(durationMs)
                .format('h[h] mm[m] ss[s]');
            var footer =
                passed === this.testCount
                    ? this.chalk.bold.green(`${this.testCount} passed`)
                    : this.chalk.bold.red(
                        `${this.testCount - passed}/${this.testCount} failed`
                    );

            footer += this.chalk.grey(` (${durationStr})`);

            if (!this.afterErrorList) this.newline();

            this.setIndent(1).useWordWrap(true);

            this.newline().write(footer).newline();

            if (this.skipped > 0) {
                this.write(
                    this.chalk.cyan(`${this.skipped} skipped`)
                ).newline();
            }

            if (warnings.length) this._renderWarnings(warnings);
        },
        _renderErrors (errs) {
            this.setIndent(3).newline();

            errs.forEach((err, idx) => {
                var prefix = this.chalk.red(`${idx + 1}) `);

                this.newline()
                    .write(this.formatError(err, prefix))
                    .newline()
                    .newline();
            });
        },

        _renderWarnings (warnings) {
            this.newline()
                .setIndent(1)
                .write(this.chalk.bold.yellow(`Warnings (${warnings.length}):`))
                .newline();

            warnings.forEach((msg) => {
                this.setIndent(1)
                    .write(this.chalk.bold.yellow('--'))
                    .newline()
                    .setIndent(2)
                    .write(msg)
                    .newline();
            });
        },
    };
};
