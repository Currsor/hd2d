const fs = require('fs');
const path = require('path');

function generateImports(rootDir, targetFile) {
  const imports = new Set(); // 使用Set去重
  
  // 遍历TypeScript文件夹
  function traverseDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        traverseDir(fullPath);
      } 
      else if (file.endsWith('.ts') && !fullPath.endsWith('MainGame.ts')) {
        // 生成相对路径，并排除MainGame.ts
        const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        imports.add(`import "./${relativePath.replace('.ts', '')}";`);
      }
    });
  }
  
  traverseDir(rootDir);
  
  // 读取目标文件内容并过滤已存在的导入语句
  const content = fs.readFileSync(targetFile, 'utf8');
  const existingImports = new Set();
  content.split('\n').forEach(line => {
    if (line.startsWith('import "./')) {
      existingImports.add(line);
    }
  });
  
  // 合并新导入和已存在的导入，确保无重复
  const finalImports = Array.from(new Set([...imports, ...existingImports]));
  const newContent = finalImports.join('\n') + '\n' + content.replace(/^import ".*"\;\n/gm, '');
  fs.writeFileSync(targetFile, newContent, 'utf8');
}

// 调用函数生成导入路径并更新MainGame.ts
generateImports('TypeScript', 'TypeScript/MainGame.ts');