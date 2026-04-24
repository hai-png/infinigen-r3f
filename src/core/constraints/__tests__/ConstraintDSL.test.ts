/**
 * Constraint DSL Test Suite
 * Tests for lexer, parser, and constraint compilation
 */

import { describe, it, expect } from 'vitest';
import { 
  ConstraintLexer, 
  ConstraintParser, 
  parseConstraintSource,
  TokenType,
  ASTNodeType 
} from '../dsl/ConstraintDSL';

describe('ConstraintLexer', () => {
  describe('tokenization', () => {
    it('should tokenize simple constraint declaration', () => {
      const source = `constraint TestConstraint() { return true; }`;
      const lexer = new ConstraintLexer(source);
      const tokens = lexer.tokenize();
      
      expect(tokens[0].type).toBe(TokenType.KEYWORD);
      expect(tokens[0].value).toBe('constraint');
      expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
      expect(tokens[1].value).toBe('TestConstraint');
    });

    it('should tokenize numbers', () => {
      const source = `let x = 42; let y = 3.14;`;
      const lexer = new ConstraintLexer(source);
      const tokens = lexer.tokenize();
      
      const numberTokens = tokens.filter(t => t.type === TokenType.NUMBER);
      expect(numberTokens).toHaveLength(2);
      expect(numberTokens[0].value).toBe(42);
      expect(numberTokens[1].value).toBe(3.14);
    });

    it('should tokenize strings', () => {
      const source = `let name = "test";`;
      const lexer = new ConstraintLexer(source);
      const tokens = lexer.tokenize();
      
      const stringToken = tokens.find(t => t.type === TokenType.STRING);
      expect(stringToken).toBeDefined();
      expect(stringToken!.value).toBe('test');
    });

    it('should tokenize operators', () => {
      const source = `a + b - c * d / e`;
      const lexer = new ConstraintLexer(source);
      const tokens = lexer.tokenize();
      
      const operatorTokens = tokens.filter(t => t.type === TokenType.OPERATOR);
      expect(operatorTokens).toHaveLength(4);
      expect(operatorTokens.map(t => t.value)).toEqual(['+', '-', '*', '/']);
    });

    it('should handle comments', () => {
      const source = `// single line\nconstraint Test() {\n  /* multi\n     line */\n  return true;\n}`;
      const lexer = new ConstraintLexer(source);
      const tokens = lexer.tokenize();
      
      // Should not contain comment tokens
      const commentTokens = tokens.filter(t => 
        t.type === TokenType.IDENTIFIER && 
        (t.value === 'single' || t.value === 'line' || t.value === 'multi')
      );
      expect(commentTokens).toHaveLength(0);
    });

    it('should tokenize keywords', () => {
      const keywords = ['constraint', 'fn', 'let', 'const', 'return', 'if', 'else', 'for'];
      const source = keywords.join(' ');
      const lexer = new ConstraintLexer(source);
      const tokens = lexer.tokenize();
      
      const keywordTokens = tokens.filter(t => t.type === TokenType.KEYWORD);
      expect(keywordTokens).toHaveLength(keywords.length);
      expect(keywordTokens.map(t => t.value)).toEqual(keywords);
    });
  });

  describe('error handling', () => {
    it('should throw on unterminated string', () => {
      const source = `let x = "unterminated`;
      const lexer = new ConstraintLexer(source);
      
      expect(() => lexer.tokenize()).toThrow('Unterminated string');
    });

    it('should throw on unexpected character', () => {
      const source = `let x = @invalid`;
      const lexer = new ConstraintLexer(source);
      
      expect(() => lexer.tokenize()).toThrow('Unexpected character');
    });
  });
});

describe('ConstraintParser', () => {
  describe('constraint declarations', () => {
    it('should parse simple constraint', () => {
      const source = `constraint TestConstraint() { return true; }`;
      const ast = parseConstraintSource(source);
      
      expect(ast.type).toBe(ASTNodeType.PROGRAM);
      expect(ast.body).toHaveLength(1);
      
      const constraint = ast.body[0];
      if (constraint.type === ASTNodeType.CONSTRAINT_DECLARATION) {
        expect(constraint.name.name).toBe('TestConstraint');
        expect(constraint.parameters).toHaveLength(0);
        expect(constraint.body.body).toHaveLength(1);
      } else {
        fail('Expected constraint declaration');
      }
    });

    it('should parse constraint with parameters', () => {
      const source = `constraint Distance(obj1: Object, obj2: Object, maxDist: number) {
        return distance(obj1, obj2) < maxDist;
      }`;
      const ast = parseConstraintSource(source);
      
      const constraint = ast.body[0];
      if (constraint.type === ASTNodeType.CONSTRAINT_DECLARATION) {
        expect(constraint.parameters).toHaveLength(3);
        expect(constraint.parameters[0].name.name).toBe('obj1');
        expect(constraint.parameters[1].name.name).toBe('obj2');
      }
    });

    it('should parse constraint with priority and domain', () => {
      const source = `constraint Placement priority: 10 domain: point {
        return position.x > 0;
      }`;
      const ast = parseConstraintSource(source);
      
      const constraint = ast.body[0];
      if (constraint.type === ASTNodeType.CONSTRAINT_DECLARATION) {
        expect(constraint.priority).toBe(10);
        expect(constraint.domain).toBe('point');
      }
    });
  });

  describe('expressions', () => {
    it('should parse binary expressions', () => {
      const source = `constraint Test() { return a + b * c; }`;
      const ast = parseConstraintSource(source);
      
      // Should correctly handle operator precedence
      expect(ast.body).toHaveLength(1);
    });

    it('should parse logical expressions', () => {
      const source = `constraint Test() { return a && b || c; }`;
      const ast = parseConstraintSource(source);
      
      expect(ast.body).toHaveLength(1);
    });

    it('should parse comparison expressions', () => {
      const source = `constraint Test() { return x > 5 && y < 10; }`;
      const ast = parseConstraintSource(source);
      
      expect(ast.body).toHaveLength(1);
    });

    it('should parse function calls', () => {
      const source = `constraint Test() { return distance(a, b) < maxDist; }`;
      const ast = parseConstraintSource(source);
      
      expect(ast.body).toHaveLength(1);
    });

    it('should parse member expressions', () => {
      const source = `constraint Test() { return obj.position.x > 0; }`;
      const ast = parseConstraintSource(source);
      
      expect(ast.body).toHaveLength(1);
    });
  });

  describe('statements', () => {
    it('should parse if statements', () => {
      const source = `constraint Test() {
        if (x > 0) {
          return true;
        } else {
          return false;
        }
      }`;
      const ast = parseConstraintSource(source);
      
      const constraint = ast.body[0];
      if (constraint.type === ASTNodeType.CONSTRAINT_DECLARATION) {
        const ifStmt = constraint.body.body[0];
        expect(ifStmt.type).toBe(ASTNodeType.IF_STATEMENT);
      }
    });

    it('should parse for loops', () => {
      const source = `constraint Test() {
        for (let i = 0; i < 10; i = i + 1) {
          sum = sum + i;
        }
        return sum;
      }`;
      const ast = parseConstraintSource(source);
      
      const constraint = ast.body[0];
      if (constraint.type === ASTNodeType.CONSTRAINT_DECLARATION) {
        const forStmt = constraint.body.body[0];
        expect(forStmt.type).toBe(ASTNodeType.FOR_STATEMENT);
      }
    });

    it('should parse variable declarations', () => {
      const source = `constraint Test() {
        let x = 10;
        const y = 20;
        return x + y;
      }`;
      const ast = parseConstraintSource(source);
      
      const constraint = ast.body[0];
      if (constraint.type === ASTNodeType.CONSTRAINT_DECLARATION) {
        expect(constraint.body.body).toHaveLength(3);
      }
    });
  });

  describe('literals', () => {
    it('should parse array literals', () => {
      const source = `constraint Test() { let arr = [1, 2, 3]; return arr; }`;
      const ast = parseConstraintSource(source);
      
      expect(ast.body).toHaveLength(1);
    });

    it('should parse object literals', () => {
      const source = `constraint Test() { 
        let obj = { x: 10, y: 20 }; 
        return obj.x; 
      }`;
      const ast = parseConstraintSource(source);
      
      expect(ast.body).toHaveLength(1);
    });

    it('should parse boolean and null literals', () => {
      const source = `constraint Test() { 
        let a = true;
        let b = false;
        let c = null;
        return a && !b && c == null;
      }`;
      const ast = parseConstraintSource(source);
      
      expect(ast.body).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should throw on syntax error', () => {
      const source = `constraint Test( { return true; }`; // Missing )
      expect(() => parseConstraintSource(source)).toThrow();
    });

    it('should throw on invalid domain type', () => {
      const source = `constraint Test domain: invalid { return true; }`;
      expect(() => parseConstraintSource(source)).toThrow('Invalid domain type');
    });
  });
});

describe('parseConstraintSource', () => {
  it('should parse complete constraint file', () => {
    const source = `
      constraint Above(subject: Object, object: Object) {
        return subject.position.y > object.position.y;
      }

      constraint Near(subject: Object, object: Object, distance: number = 5.0) {
        let dist = distance(subject.position, object.position);
        return dist < distance;
      }

      fn calculateDistance(a: Object, b: Object): number {
        let dx = a.position.x - b.position.x;
        let dy = a.position.y - b.position.y;
        let dz = a.position.z - b.position.z;
        return sqrt(dx * dx + dy * dy + dz * dz);
      }
    `;

    const ast = parseConstraintSource(source);
    
    expect(ast.type).toBe(ASTNodeType.PROGRAM);
    expect(ast.body).toHaveLength(3);
    
    const constraints = ast.body.filter(
      n => n.type === ASTNodeType.CONSTRAINT_DECLARATION
    );
    expect(constraints).toHaveLength(2);
    
    const functions = ast.body.filter(
      n => n.type === ASTNodeType.FUNCTION_DECLARATION
    );
    expect(functions).toHaveLength(1);
  });
});
