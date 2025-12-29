
const fs = require('fs');
const filePath = 'c:\\Users\\ASUS\\Desktop\\Romaa_BE\\src\\module\\project\\scheduleNew\\schedulelite\\schedulelite.service.js';

try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let braceCount = 0;
    let stack = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Simple heuristic: remove regex and strings to avoid false positives (very basic)
        // This is not a full parser, but might catch simple nesting issues
        let cleanLine = line.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''").replace(/\`[^\`]*\`/g, '``');
        cleanLine = cleanLine.replace(/\/\/.*/g, ''); // remove comments

        for (let char of cleanLine) {
            if (char === '{') {
                braceCount++;
                stack.push(i + 1);
            } else if (char === '}') {
                braceCount--;
                stack.pop();
            }
        }

        // Check specific points
        if (i + 1 === 1260) {
            console.log(`At line 1260, brace depth is: ${braceCount}`);
            if (braceCount === 0) {
                console.log("CRITICAL: Class seems closed before line 1260!");
            }
        }
    }
    console.log(`Final brace count: ${braceCount}`);
} catch (err) {
    console.error(err);
}
