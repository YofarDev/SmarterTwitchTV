/* Test-only extraction: no test exports are added to the shipped app API. */
const fs = require('fs');
const vm = require('vm');

module.exports = function loadUIFoundation() {
    const sandbox = {};
    vm.createContext(sandbox);
    const ids = fs
        .readFileSync('app/specific/Main.js', 'utf8')
        .match(/^var Main_[A-Za-z_]+ = \d+;/gm)
        .slice(0, 28)
        .join('\n');
    // Recommended (ScreensObj.js) is off unless a test turns it on; Navigation reads it lazily
    sandbox.ScreensObj_RecommendedEnabled = () => false;
    if (process.argv.includes('--built')) {
        // Run the actual emitted production definitions, retaining their closure dependencies.
        // Extraction avoids publishing fixture-only exports on the native bridge API.
        const UglifyJS = require('uglify-js');
        const ast = UglifyJS.parse(fs.readFileSync('release/githubio/js/main_uncompressed.js', 'utf8'));
        const definitions = [];
        ast.walk(
            new UglifyJS.TreeWalker(function (node) {
                if (node instanceof UglifyJS.AST_Defun && /^(Navigation_|UIFocus_|Search_)/.test(node.name.name)) definitions.push(node.print_to_string());
                if (node instanceof UglifyJS.AST_Var) {
                    const matches = node.definitions.filter(def => /^(Navigation_|UIFocus_|Search_)/.test(def.name.name));
                    if (matches.length) definitions.push(new UglifyJS.AST_Var({definitions: matches}).print_to_string());
                }
            })
        );
        if (definitions.length < 20) throw new Error('Rebuild first: UI foundation missing from generated source');
        vm.runInContext(ids + '\n' + definitions.join('\n'), sandbox);
    } else {
        // Evaluation is safe before Main or the other helper loads. No listeners/storage/DOM work.
        vm.runInContext(fs.readFileSync('app/specific/Navigation.js', 'utf8'), sandbox);
        vm.runInContext(fs.readFileSync('app/specific/UIFocus.js', 'utf8'), sandbox);
        vm.runInContext(fs.readFileSync('app/specific/Search.js', 'utf8'), sandbox);
        vm.runInContext(ids, sandbox);
    }
    return sandbox;
};
