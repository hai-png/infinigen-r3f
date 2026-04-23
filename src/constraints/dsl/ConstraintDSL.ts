/**
 * Constraint Language DSL for Infinigen R3F
 * 
 * Implements a domain-specific language for defining procedural generation constraints.
 * Based on the original Infinigen constraint system from Princeton VL.
 * 
 * @module constraints/dsl
 */

import type { ConstraintType, ConstraintOperator, DomainType } from '../types';

/**
 * Token types for the constraint lexer
 */
export enum TokenType {
  IDENTIFIER = 'IDENTIFIER',
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  OPERATOR = 'OPERATOR',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACE = 'LBRACE',
  RBRACE = 'RBRACE',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  COMMA = 'COMMA',
  COLON = 'COLON',
  ARROW = 'ARROW',
  KEYWORD = 'KEYWORD',
  EOF = 'EOF'
}

/**
 * Lexer token interface
 */
export interface Token {
  type: TokenType;
  value: string | number;
  line: number;
  column: number;
}

/**
 * AST Node types
 */
export enum ASTNodeType {
  PROGRAM = 'PROGRAM',
  CONSTRAINT_DECLARATION = 'CONSTRAINT_DECLARATION',
  BINARY_EXPRESSION = 'BINARY_EXPRESSION',
  UNARY_EXPRESSION = 'UNARY_EXPRESSION',
  MEMBER_EXPRESSION = 'MEMBER_EXPRESSION',
  CALL_EXPRESSION = 'CALL_EXPRESSION',
  IDENTIFIER = 'IDENTIFIER',
  LITERAL = 'LITERAL',
  ARRAY_LITERAL = 'ARRAY_LITERAL',
  OBJECT_LITERAL = 'OBJECT_LITERAL',
  FUNCTION_DECLARATION = 'FUNCTION_DECLARATION',
  BLOCK_STATEMENT = 'BLOCK_STATEMENT',
  RETURN_STATEMENT = 'RETURN_STATEMENT',
  IF_STATEMENT = 'IF_STATEMENT',
  FOR_STATEMENT = 'FOR_STATEMENT'
}

/**
 * Base AST Node
 */
export interface ASTNode {
  type: ASTNodeType;
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

/**
 * Program root node
 */
export interface Program extends ASTNode {
  type: ASTNodeType.PROGRAM;
  body: (ConstraintDeclaration | FunctionDeclaration | Statement)[];
}

/**
 * Constraint declaration
 */
export interface ConstraintDeclaration extends ASTNode {
  type: ASTNodeType.CONSTRAINT_DECLARATION;
  name: Identifier;
  parameters: Parameter[];
  body: BlockStatement;
  priority?: number;
  domain?: DomainType;
}

/**
 * Function parameter
 */
export interface Parameter {
  name: Identifier;
  typeAnnotation?: TypeAnnotation;
  defaultValue?: Expression;
}

/**
 * Type annotation
 */
export interface TypeAnnotation {
  type: 'GenericType' | 'ArrayType' | 'ObjectType';
  name: string;
  typeParameters?: TypeAnnotation[];
}

/**
 * Block statement
 */
export interface BlockStatement extends ASTNode {
  type: ASTNodeType.BLOCK_STATEMENT;
  body: Statement[];
}

/**
 * Statement types
 */
export type Statement = 
  | ReturnStatement
  | IfStatement
  | ForStatement
  | ExpressionStatement
  | VariableDeclaration;

/**
 * Return statement
 */
export interface ReturnStatement extends ASTNode {
  type: ASTNodeType.RETURN_STATEMENT;
  argument: Expression | null;
}

/**
 * If statement
 */
export interface IfStatement extends ASTNode {
  type: ASTNodeType.IF_STATEMENT;
  test: Expression;
  consequent: BlockStatement;
  alternate?: BlockStatement;
}

/**
 * For statement
 */
export interface ForStatement extends ASTNode {
  type: ASTNodeType.FOR_STATEMENT;
  init: VariableDeclaration | Expression | null;
  test: Expression | null;
  update: Expression | null;
  body: BlockStatement;
}

/**
 * Expression statement
 */
export interface ExpressionStatement extends ASTNode {
  type: ASTNodeType.EXPRESSION_STATEMENT;
  expression: Expression;
}

/**
 * Variable declaration
 */
export interface VariableDeclaration extends ASTNode {
  type: ASTNodeType.VARIABLE_DECLARATION;
  declarations: VariableDeclarator[];
  kind: 'let' | 'const' | 'var';
}

/**
 * Variable declarator
 */
export interface VariableDeclarator {
  id: Identifier | Pattern;
  init?: Expression;
}

/**
 * Pattern types
 */
export type Pattern = Identifier | ObjectPattern | ArrayPattern;

/**
 * Object pattern
 */
export interface ObjectPattern extends ASTNode {
  type: 'ObjectPattern';
  properties: Property[];
}

/**
 * Array pattern
 */
export interface ArrayPattern extends ASTNode {
  type: 'ArrayPattern';
  elements: (Pattern | null)[];
}

/**
 * Expression types
 */
export type Expression = 
  | BinaryExpression
  | UnaryExpression
  | MemberExpression
  | CallExpression
  | Identifier
  | Literal
  | ArrayLiteral
  | ObjectLiteral
  | FunctionExpression
  | ArrowFunction
  | ConditionalExpression
  | AssignmentExpression;

/**
 * Binary expression
 */
export interface BinaryExpression extends ASTNode {
  type: ASTNodeType.BINARY_EXPRESSION;
  operator: ConstraintOperator;
  left: Expression;
  right: Expression;
}

/**
 * Unary expression
 */
export interface UnaryExpression extends ASTNode {
  type: ASTNodeType.UNARY_EXPRESSION;
  operator: '!' | '-' | '+' | '~';
  argument: Expression;
  prefix: boolean;
}

/**
 * Member expression
 */
export interface MemberExpression extends ASTNode {
  type: ASTNodeType.MEMBER_EXPRESSION;
  object: Expression;
  property: Identifier | Expression;
  computed: boolean;
}

/**
 * Call expression
 */
export interface CallExpression extends ASTNode {
  type: ASTNodeType.CALL_EXPRESSION;
  callee: Expression;
  arguments: Expression[];
}

/**
 * Identifier
 */
export interface Identifier extends ASTNode {
  type: ASTNodeType.IDENTIFIER;
  name: string;
}

/**
 * Literal value
 */
export interface Literal extends ASTNode {
  type: ASTNodeType.LITERAL;
  value: string | number | boolean | null;
  raw?: string;
}

/**
 * Array literal
 */
export interface ArrayLiteral extends ASTNode {
  type: ASTNodeType.ARRAY_LITERAL;
  elements: (Expression | null)[];
}

/**
 * Object literal
 */
export interface ObjectLiteral extends ASTNode {
  type: ASTNodeType.OBJECT_LITERAL;
  properties: Property[];
}

/**
 * Property
 */
export interface Property {
  key: Identifier | Literal;
  value: Expression;
  kind: 'init' | 'get' | 'set';
  method: boolean;
  shorthand: boolean;
  computed: boolean;
}

/**
 * Function expression
 */
export interface FunctionExpression extends ASTNode {
  type: ASTNodeType.FUNCTION_DECLARATION;
  id?: Identifier;
  params: Parameter[];
  body: BlockStatement;
  generator: boolean;
  async: boolean;
}

/**
 * Arrow function
 */
export interface ArrowFunction extends ASTNode {
  type: 'ArrowFunction';
  params: Parameter[];
  body: BlockStatement | Expression;
  async: boolean;
  expression: boolean;
}

/**
 * Conditional expression
 */
export interface ConditionalExpression extends ASTNode {
  type: 'ConditionalExpression';
  test: Expression;
  consequent: Expression;
  alternate: Expression;
}

/**
 * Assignment expression
 */
export interface AssignmentExpression extends ASTNode {
  type: 'AssignmentExpression';
  operator: '=' | '+=' | '-=' | '*=' | '/=' | '%=';
  left: Expression;
  right: Expression;
}

/**
 * Constraint Lexer - Tokenizes constraint language source code
 */
export class ConstraintLexer {
  private source: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  private keywords = new Set([
    'constraint', 'fn', 'let', 'const', 'return', 'if', 'else', 'for', 'in', 'of',
    'true', 'false', 'null', 'domain', 'priority', 'check', 'require', 'ensure'
  ]);

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (this.position < this.source.length) {
      this.skipWhitespace();
      this.skipComments();
      
      if (this.position >= this.source.length) break;

      const char = this.source[this.position];

      // String literals
      if (char === '"' || char === "'") {
        this.tokens.push(this.readString(char));
        continue;
      }

      // Numbers
      if (this.isDigit(char) || (char === '.' && this.isDigit(this.peek()))) {
        this.tokens.push(this.readNumber());
        continue;
      }

      // Identifiers and keywords
      if (this.isAlpha(char) || char === '_') {
        this.tokens.push(this.readIdentifier());
        continue;
      }

      // Operators and punctuation
      switch (char) {
        case '(':
          this.tokens.push(this.makeToken(TokenType.LPAREN, '('));
          break;
        case ')':
          this.tokens.push(this.makeToken(TokenType.RPAREN, ')'));
          break;
        case '{':
          this.tokens.push(this.makeToken(TokenType.LBRACE, '{'));
          break;
        case '}':
          this.tokens.push(this.makeToken(TokenType.RBRACE, '}'));
          break;
        case '[':
          this.tokens.push(this.makeToken(TokenType.LBRACKET, '['));
          break;
        case ']':
          this.tokens.push(this.makeToken(TokenType.RBRACKET, ']'));
          break;
        case ',':
          this.tokens.push(this.makeToken(TokenType.COMMA, ','));
          break;
        case ':':
          this.tokens.push(this.makeToken(TokenType.COLON, ':'));
          break;
        case '+':
          this.advance();
          if (this.match('=')) {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '+='));
          } else {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '+'));
          }
          break;
        case '-':
          this.advance();
          if (this.match('=')) {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '-='));
          } else if (this.match('>')) {
            this.tokens.push(this.makeToken(TokenType.ARROW, '->'));
          } else {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '-'));
          }
          break;
        case '*':
          this.advance();
          if (this.match('=')) {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '*='));
          } else {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '*'));
          }
          break;
        case '/':
          this.advance();
          if (this.match('=')) {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '/='));
          } else {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '/'));
          }
          break;
        case '%':
          this.advance();
          if (this.match('=')) {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '%='));
          } else {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '%'));
          }
          break;
        case '=':
          this.advance();
          if (this.match('=')) {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '=='));
          } else {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '='));
          }
          break;
        case '!':
          this.advance();
          if (this.match('=')) {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '!='));
          } else {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '!'));
          }
          break;
        case '<':
          this.advance();
          if (this.match('=')) {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '<='));
          } else {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '<'));
          }
          break;
        case '>':
          this.advance();
          if (this.match('=')) {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '>='));
          } else {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '>'));
          }
          break;
        case '&':
          this.advance();
          if (this.match('&')) {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '&&'));
          } else {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '&'));
          }
          break;
        case '|':
          this.advance();
          if (this.match('|')) {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '||'));
          } else {
            this.tokens.push(this.makeToken(TokenType.OPERATOR, '|'));
          }
          break;
        default:
          throw new Error(`Unexpected character '${char}' at line ${this.line}, column ${this.column}`);
      }
    }

    this.tokens.push({
      type: TokenType.EOF,
      value: '',
      line: this.line,
      column: this.column
    });

    return this.tokens;
  }

  private skipWhitespace(): void {
    while (this.isWhitespace(this.peek())) {
      this.advance();
    }
  }

  private skipComments(): void {
    if (this.peek() === '/' && this.peekNext() === '/') {
      while (this.peek() !== '\n' && this.position < this.source.length) {
        this.advance();
      }
    } else if (this.peek() === '/' && this.peekNext() === '*') {
      this.advance(); // /
      this.advance(); // *
      while (this.position < this.source.length) {
        if (this.peek() === '*' && this.peekNext() === '/') {
          this.advance(); // *
          this.advance(); // /
          break;
        }
        this.advance();
      }
    }
  }

  private readString(quote: string): Token {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '';
    
    this.advance(); // opening quote
    
    while (this.peek() !== quote && this.position < this.source.length) {
      if (this.peek() === '\\') {
        this.advance();
        const escaped = this.readEscapeSequence();
        value += escaped;
      } else {
        value += this.advance();
      }
    }
    
    if (this.peek() !== quote) {
      throw new Error(`Unterminated string at line ${startLine}, column ${startColumn}`);
    }
    
    this.advance(); // closing quote
    
    return {
      type: TokenType.STRING,
      value,
      line: startLine,
      column: startColumn
    };
  }

  private readEscapeSequence(): string {
    const char = this.advance();
    switch (char) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '\\': return '\\';
      case '"': return '"';
      case "'": return "'";
      default: return char;
    }
  }

  private readNumber(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '';

    while (this.isDigit(this.peek())) {
      value += this.advance();
    }

    // Decimal part
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      value += this.advance(); // .
      while (this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    // Exponent part
    if (this.peek() === 'e' || this.peek() === 'E') {
      value += this.advance();
      if (this.peek() === '+' || this.peek() === '-') {
        value += this.advance();
      }
      while (this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    return {
      type: TokenType.NUMBER,
      value: parseFloat(value),
      line: startLine,
      column: startColumn
    };
  }

  private readIdentifier(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '';

    while (this.isAlphaNumeric(this.peek()) || this.peek() === '_') {
      value += this.advance();
    }

    const type = this.keywords.has(value) ? TokenType.KEYWORD : TokenType.IDENTIFIER;

    return {
      type,
      value,
      line: startLine,
      column: startColumn
    };
  }

  private makeToken(type: TokenType, value: string | number): Token {
    return {
      type,
      value,
      line: this.line,
      column: this.column
    };
  }

  private advance(): string {
    const char = this.source[this.position++];
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  private peek(): string {
    return this.source[this.position] || '';
  }

  private peekNext(): string {
    return this.source[this.position + 1] || '';
  }

  private match(expected: string): boolean {
    if (this.peek() !== expected) return false;
    this.advance();
    return true;
  }

  private isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\n' || char === '\r';
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }
}

/**
 * Constraint Parser - Builds AST from tokens
 */
export class ConstraintParser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Program {
    const program: Program = {
      type: ASTNodeType.PROGRAM,
      body: []
    };

    while (!this.isAtEnd()) {
      const declaration = this.parseDeclaration();
      if (declaration) {
        program.body.push(declaration);
      }
    }

    return program;
  }

  private parseDeclaration(): ConstraintDeclaration | FunctionDeclaration | Statement | null {
    if (this.match(TokenType.KEYWORD, 'constraint')) {
      return this.parseConstraintDeclaration();
    }
    
    if (this.match(TokenType.KEYWORD, 'fn')) {
      return this.parseFunctionDeclaration();
    }

    return this.parseStatement();
  }

  private parseConstraintDeclaration(): ConstraintDeclaration {
    const name = this.consume(TokenType.IDENTIFIER, 'Expected constraint name');
    
    const params = this.parseParameters();
    
    let priority: number | undefined;
    let domain: DomainType | undefined;

    // Parse optional modifiers
    while (this.check(TokenType.KEYWORD)) {
      if (this.checkNext('priority')) {
        this.advance();
        this.consume(TokenType.COLON, 'Expected colon after priority');
        priority = this.parseNumber();
      } else if (this.checkNext('domain')) {
        this.advance();
        this.consume(TokenType.COLON, 'Expected colon after domain');
        domain = this.parseDomainType();
      } else {
        break;
      }
    }

    const body = this.parseBlock();

    return {
      type: ASTNodeType.CONSTRAINT_DECLARATION,
      name,
      parameters: params,
      body,
      priority,
      domain
    };
  }

  private parseFunctionDeclaration(): FunctionDeclaration {
    const name = this.consume(TokenType.IDENTIFIER, 'Expected function name');
    const params = this.parseParameters();
    const body = this.parseBlock();

    return {
      type: ASTNodeType.FUNCTION_DECLARATION,
      id: name,
      params,
      body,
      generator: false,
      async: false
    };
  }

  private parseParameters(): Parameter[] {
    const params: Parameter[] = [];

    this.consume(TokenType.LPAREN, 'Expected (');

    if (!this.check(TokenType.RPAREN)) {
      do {
        const param = this.parseParameter();
        params.push(param);
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RPAREN, 'Expected )');

    return params;
  }

  private parseParameter(): Parameter {
    const name = this.consume(TokenType.IDENTIFIER, 'Expected parameter name');
    
    let typeAnnotation: TypeAnnotation | undefined;
    if (this.match(TokenType.COLON)) {
      typeAnnotation = this.parseTypeAnnotation();
    }

    let defaultValue: Expression | undefined;
    if (this.match(TokenType.OPERATOR, '=')) {
      defaultValue = this.parseExpression();
    }

    return { name, typeAnnotation, defaultValue };
  }

  private parseTypeAnnotation(): TypeAnnotation {
    const typeName = this.consume(TokenType.IDENTIFIER, 'Expected type name');
    
    let typeParameters: TypeAnnotation[] | undefined;
    if (this.match(TokenType.LBRACKET)) {
      typeParameters = [];
      if (!this.check(TokenType.RBRACKET)) {
        do {
          typeParameters.push(this.parseTypeAnnotation());
        } while (this.match(TokenType.COMMA));
      }
      this.consume(TokenType.RBRACKET, 'Expected ]');
    }

    return {
      type: 'GenericType',
      name: typeName.name,
      typeParameters
    };
  }

  private parseDomainType(): DomainType {
    const token = this.consume(TokenType.IDENTIFIER, 'Expected domain type');
    const validDomains: DomainType[] = ['point', 'edge', 'face', 'face_corner', 'spline', 'instance'];
    
    if (!validDomains.includes(token.name as DomainType)) {
      throw new Error(`Invalid domain type '${token.name}' at line ${token.line}`);
    }

    return token.name as DomainType;
  }

  private parseBlock(): BlockStatement {
    this.consume(TokenType.LBRACE, 'Expected {');
    
    const statements: Statement[] = [];
    
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      statements.push(this.parseStatement());
    }
    
    this.consume(TokenType.RBRACE, 'Expected }');

    return {
      type: ASTNodeType.BLOCK_STATEMENT,
      body: statements
    };
  }

  private parseStatement(): Statement {
    if (this.match(TokenType.KEYWORD, 'return')) {
      return this.parseReturnStatement();
    }

    if (this.match(TokenType.KEYWORD, 'if')) {
      return this.parseIfStatement();
    }

    if (this.match(TokenType.KEYWORD, 'for')) {
      return this.parseForStatement();
    }

    if (this.match(TokenType.KEYWORD, 'let') || this.match(TokenType.KEYWORD, 'const')) {
      return this.parseVariableDeclaration();
    }

    return this.parseExpressionStatement();
  }

  private parseReturnStatement(): ReturnStatement {
    const keyword = this.previous();
    let argument: Expression | null = null;

    if (!this.check(TokenType.SEMICOLON) && !this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      argument = this.parseExpression();
    }

    this.consumeSemicolon();

    return {
      type: ASTNodeType.RETURN_STATEMENT,
      argument,
      loc: {
        start: { line: keyword.line, column: keyword.column },
        end: { line: this.previous().line, column: this.previous().column }
      }
    };
  }

  private parseIfStatement(): IfStatement {
    const keyword = this.previous();
    
    this.consume(TokenType.LPAREN, 'Expected (');
    const test = this.parseExpression();
    this.consume(TokenType.RPAREN, 'Expected )');
    
    const consequent = this.parseBlock();
    
    let alternate: BlockStatement | undefined;
    if (this.match(TokenType.KEYWORD, 'else')) {
      alternate = this.parseBlock();
    }

    return {
      type: ASTNodeType.IF_STATEMENT,
      test,
      consequent,
      alternate,
      loc: {
        start: { line: keyword.line, column: keyword.column },
        end: { line: this.previous().line, column: this.previous().column }
      }
    };
  }

  private parseForStatement(): ForStatement {
    const keyword = this.previous();
    
    this.consume(TokenType.LPAREN, 'Expected (');
    
    let init: VariableDeclaration | Expression | null = null;
    if (!this.check(TokenType.SEMICOLON)) {
      if (this.check(TokenType.KEYWORD, 'let') || this.check(TokenType.KEYWORD, 'const')) {
        init = this.parseVariableDeclaration();
      } else {
        init = this.parseExpression();
      }
    }
    this.consume(TokenType.SEMICOLON, 'Expected ;');
    
    let test: Expression | null = null;
    if (!this.check(TokenType.SEMICOLON)) {
      test = this.parseExpression();
    }
    this.consume(TokenType.SEMICOLON, 'Expected ;');
    
    let update: Expression | null = null;
    if (!this.check(TokenType.RPAREN)) {
      update = this.parseExpression();
    }
    
    this.consume(TokenType.RPAREN, 'Expected )');
    
    const body = this.parseBlock();

    return {
      type: ASTNodeType.FOR_STATEMENT,
      init,
      test,
      update,
      body,
      loc: {
        start: { line: keyword.line, column: keyword.column },
        end: { line: this.previous().line, column: this.previous().column }
      }
    };
  }

  private parseVariableDeclaration(): VariableDeclaration {
    const keyword = this.previous();
    const kind = keyword.value as 'let' | 'const' | 'var';
    
    const declarations: VariableDeclarator[] = [];
    
    do {
      const id = this.consume(TokenType.IDENTIFIER, 'Expected variable name');
      
      let init: Expression | undefined;
      if (this.match(TokenType.OPERATOR, '=')) {
        init = this.parseExpression();
      }
      
      declarations.push({ id, init });
    } while (this.match(TokenType.COMMA));

    this.consumeSemicolon();

    return {
      type: ASTNodeType.VARIABLE_DECLARATION,
      declarations,
      kind,
      loc: {
        start: { line: keyword.line, column: keyword.column },
        end: { line: this.previous().line, column: this.previous().column }
      }
    };
  }

  private parseExpressionStatement(): ExpressionStatement {
    const expression = this.parseExpression();
    this.consumeSemicolon();
    
    return {
      type: ASTNodeType.EXPRESSION_STATEMENT,
      expression
    };
  }

  private parseExpression(): Expression {
    return this.parseAssignment();
  }

  private parseAssignment(): Expression {
    const expr = this.parseLogicalOr();

    if (this.match(TokenType.OPERATOR, '=', '+=', '-=', '*=', '/=', '%=')) {
      const operator = this.previous().value as string;
      const right = this.parseAssignment();
      
      return {
        type: 'AssignmentExpression',
        operator: operator as any,
        left: expr,
        right
      };
    }

    return expr;
  }

  private parseLogicalOr(): Expression {
    let expr = this.parseLogicalAnd();

    while (this.match(TokenType.OPERATOR, '||')) {
      const operator = this.previous().value as ConstraintOperator;
      const right = this.parseLogicalAnd();
      
      expr = {
        type: ASTNodeType.BINARY_EXPRESSION,
        operator,
        left: expr,
        right
      };
    }

    return expr;
  }

  private parseLogicalAnd(): Expression {
    let expr = this.parseEquality();

    while (this.match(TokenType.OPERATOR, '&&')) {
      const operator = this.previous().value as ConstraintOperator;
      const right = this.parseEquality();
      
      expr = {
        type: ASTNodeType.BINARY_EXPRESSION,
        operator,
        left: expr,
        right
      };
    }

    return expr;
  }

  private parseEquality(): Expression {
    let expr = this.parseComparison();

    while (this.match(TokenType.OPERATOR, '==', '!=', '===', '!==')) {
      const operator = this.previous().value as ConstraintOperator;
      const right = this.parseComparison();
      
      expr = {
        type: ASTNodeType.BINARY_EXPRESSION,
        operator,
        left: expr,
        right
      };
    }

    return expr;
  }

  private parseComparison(): Expression {
    let expr = this.parseAdditive();

    while (this.match(TokenType.OPERATOR, '<', '>', '<=', '>=')) {
      const operator = this.previous().value as ConstraintOperator;
      const right = this.parseAdditive();
      
      expr = {
        type: ASTNodeType.BINARY_EXPRESSION,
        operator,
        left: expr,
        right
      };
    }

    return expr;
  }

  private parseAdditive(): Expression {
    let expr = this.parseMultiplicative();

    while (this.match(TokenType.OPERATOR, '+', '-')) {
      const operator = this.previous().value as ConstraintOperator;
      const right = this.parseMultiplicative();
      
      expr = {
        type: ASTNodeType.BINARY_EXPRESSION,
        operator,
        left: expr,
        right
      };
    }

    return expr;
  }

  private parseMultiplicative(): Expression {
    let expr = this.parseUnary();

    while (this.match(TokenType.OPERATOR, '*', '/', '%')) {
      const operator = this.previous().value as ConstraintOperator;
      const right = this.parseUnary();
      
      expr = {
        type: ASTNodeType.BINARY_EXPRESSION,
        operator,
        left: expr,
        right
      };
    }

    return expr;
  }

  private parseUnary(): Expression {
    if (this.match(TokenType.OPERATOR, '!', '-', '+', '~')) {
      const operator = this.previous().value as '!' | '-' | '+' | '~';
      const argument = this.parseUnary();
      
      return {
        type: ASTNodeType.UNARY_EXPRESSION,
        operator,
        argument,
        prefix: true
      };
    }

    return this.parseCall();
  }

  private parseCall(): Expression {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match(TokenType.LPAREN)) {
        expr = this.finishCall(expr);
      } else if (this.match(TokenType.LBRACKET)) {
        const property = this.parseExpression();
        this.consume(TokenType.RBRACKET, 'Expected ]');
        
        expr = {
          type: ASTNodeType.MEMBER_EXPRESSION,
          object: expr,
          property,
          computed: true
        };
      } else if (this.match(TokenType.DOT)) {
        const property = this.consume(TokenType.IDENTIFIER, 'Expected property name');
        
        expr = {
          type: ASTNodeType.MEMBER_EXPRESSION,
          object: expr,
          property,
          computed: false
        };
      } else {
        break;
      }
    }

    return expr;
  }

  private finishCall(callee: Expression): CallExpression {
    const args: Expression[] = [];

    if (!this.check(TokenType.RPAREN)) {
      do {
        args.push(this.parseExpression());
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RPAREN, 'Expected )');

    return {
      type: ASTNodeType.CALL_EXPRESSION,
      callee,
      arguments: args
    };
  }

  private parsePrimary(): Expression {
    if (this.match(TokenType.KEYWORD, 'true')) {
      return {
        type: ASTNodeType.LITERAL,
        value: true
      };
    }

    if (this.match(TokenType.KEYWORD, 'false')) {
      return {
        type: ASTNodeType.LITERAL,
        value: false
      };
    }

    if (this.match(TokenType.KEYWORD, 'null')) {
      return {
        type: ASTNodeType.LITERAL,
        value: null
      };
    }

    if (this.match(TokenType.NUMBER)) {
      return {
        type: ASTNodeType.LITERAL,
        value: this.previous().value as number
      };
    }

    if (this.match(TokenType.STRING)) {
      return {
        type: ASTNodeType.LITERAL,
        value: this.previous().value as string
      };
    }

    if (this.match(TokenType.IDENTIFIER)) {
      return {
        type: ASTNodeType.IDENTIFIER,
        name: this.previous().value as string
      };
    }

    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      this.consume(TokenType.RPAREN, 'Expected )');
      return expr;
    }

    if (this.match(TokenType.LBRACKET)) {
      return this.parseArrayLiteral();
    }

    if (this.match(TokenType.LBRACE)) {
      return this.parseObjectLiteral();
    }

    throw new Error(`Unexpected token ${this.peek().type} at line ${this.peek().line}`);
  }

  private parseArrayLiteral(): ArrayLiteral {
    const elements: (Expression | null)[] = [];

    while (!this.check(TokenType.RBRACKET)) {
      if (this.match(TokenType.COMMA)) {
        elements.push(null);
      } else {
        elements.push(this.parseExpression());
        if (!this.match(TokenType.COMMA)) break;
      }
    }

    this.consume(TokenType.RBRACKET, 'Expected ]');

    return {
      type: ASTNodeType.ARRAY_LITERAL,
      elements
    };
  }

  private parseObjectLiteral(): ObjectLiteral {
    const properties: Property[] = [];

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consume(TokenType.IDENTIFIER, 'Expected property name');
      
      let value: Expression;
      if (this.match(TokenType.COLON)) {
        value = this.parseExpression();
      } else {
        // Shorthand property
        value = {
          type: ASTNodeType.IDENTIFIER,
          name: key.name
        };
      }

      properties.push({
        key,
        value,
        kind: 'init',
        method: false,
        shorthand: key.name === (value as any).name,
        computed: false
      });

      if (!this.match(TokenType.COMMA)) break;
    }

    this.consume(TokenType.RBRACE, 'Expected }');

    return {
      type: ASTNodeType.OBJECT_LITERAL,
      properties
    };
  }

  private parseNumber(): number {
    const token = this.consume(TokenType.NUMBER, 'Expected number');
    return token.value as number;
  }

  // Helper methods
  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(`${message} at line ${this.peek().line}, column ${this.peek().column}`);
  }

  private consumeSemicolon(): void {
    if (this.match(TokenType.SEMICOLON)) return;
    // Allow ASI (Automatic Semicolon Insertion)
    if (this.check(TokenType.RBRACE) || this.check(TokenType.RPAREN) || this.isAtEnd()) return;
    throw new Error(`Expected ';' at line ${this.peek().line}, column ${this.peek().column}`);
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private checkNext(value: string): boolean {
    return this.peekNext().value === value;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private peekNext(): Token {
    return this.tokens[this.current + 1];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }
}

/**
 * Parse constraint language source code into AST
 */
export function parseConstraintSource(source: string): Program {
  const lexer = new ConstraintLexer(source);
  const tokens = lexer.tokenize();
  const parser = new ConstraintParser(tokens);
  return parser.parse();
}

/**
 * Compile constraint source to executable function
 */
export function compileConstraint(
  source: string,
  context: Record<string, any> = {}
): (...args: any[]) => any {
  const ast = parseConstraintSource(source);
  
  // TODO: Implement code generator and evaluator
  // This will be connected to the constraint solver system
  
  return function evaluate(...args: any[]): any {
    // Placeholder implementation
    console.log('Constraint evaluation not yet implemented');
    return true;
  };
}
