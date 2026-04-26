/**
 * Constraint Language DSL for Infinigen R3F
 *
 * Implements a domain-specific language for defining procedural generation constraints.
 * Based on the original Infinigen constraint system from Princeton VL.
 *
 * @module constraints/dsl
 */
/**
 * Token types for the constraint lexer
 */
export var TokenType;
(function (TokenType) {
    TokenType["IDENTIFIER"] = "IDENTIFIER";
    TokenType["NUMBER"] = "NUMBER";
    TokenType["STRING"] = "STRING";
    TokenType["OPERATOR"] = "OPERATOR";
    TokenType["LPAREN"] = "LPAREN";
    TokenType["RPAREN"] = "RPAREN";
    TokenType["LBRACE"] = "LBRACE";
    TokenType["RBRACE"] = "RBRACE";
    TokenType["LBRACKET"] = "LBRACKET";
    TokenType["RBRACKET"] = "RBRACKET";
    TokenType["COMMA"] = "COMMA";
    TokenType["COLON"] = "COLON";
    TokenType["ARROW"] = "ARROW";
    TokenType["KEYWORD"] = "KEYWORD";
    TokenType["EOF"] = "EOF";
})(TokenType || (TokenType = {}));
/**
 * AST Node types
 */
export var ASTNodeType;
(function (ASTNodeType) {
    ASTNodeType["PROGRAM"] = "PROGRAM";
    ASTNodeType["CONSTRAINT_DECLARATION"] = "CONSTRAINT_DECLARATION";
    ASTNodeType["BINARY_EXPRESSION"] = "BINARY_EXPRESSION";
    ASTNodeType["UNARY_EXPRESSION"] = "UNARY_EXPRESSION";
    ASTNodeType["MEMBER_EXPRESSION"] = "MEMBER_EXPRESSION";
    ASTNodeType["CALL_EXPRESSION"] = "CALL_EXPRESSION";
    ASTNodeType["IDENTIFIER"] = "IDENTIFIER";
    ASTNodeType["LITERAL"] = "LITERAL";
    ASTNodeType["ARRAY_LITERAL"] = "ARRAY_LITERAL";
    ASTNodeType["OBJECT_LITERAL"] = "OBJECT_LITERAL";
    ASTNodeType["FUNCTION_DECLARATION"] = "FUNCTION_DECLARATION";
    ASTNodeType["BLOCK_STATEMENT"] = "BLOCK_STATEMENT";
    ASTNodeType["RETURN_STATEMENT"] = "RETURN_STATEMENT";
    ASTNodeType["IF_STATEMENT"] = "IF_STATEMENT";
    ASTNodeType["FOR_STATEMENT"] = "FOR_STATEMENT";
})(ASTNodeType || (ASTNodeType = {}));
/**
 * Constraint Lexer - Tokenizes constraint language source code
 */
export class ConstraintLexer {
    constructor(source) {
        this.position = 0;
        this.line = 1;
        this.column = 1;
        this.tokens = [];
        this.keywords = new Set([
            'constraint', 'fn', 'let', 'const', 'return', 'if', 'else', 'for', 'in', 'of',
            'true', 'false', 'null', 'domain', 'priority', 'check', 'require', 'ensure'
        ]);
        this.source = source;
    }
    tokenize() {
        while (this.position < this.source.length) {
            this.skipWhitespace();
            this.skipComments();
            if (this.position >= this.source.length)
                break;
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
                    }
                    else {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '+'));
                    }
                    break;
                case '-':
                    this.advance();
                    if (this.match('=')) {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '-='));
                    }
                    else if (this.match('>')) {
                        this.tokens.push(this.makeToken(TokenType.ARROW, '->'));
                    }
                    else {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '-'));
                    }
                    break;
                case '*':
                    this.advance();
                    if (this.match('=')) {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '*='));
                    }
                    else {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '*'));
                    }
                    break;
                case '/':
                    this.advance();
                    if (this.match('=')) {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '/='));
                    }
                    else {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '/'));
                    }
                    break;
                case '%':
                    this.advance();
                    if (this.match('=')) {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '%='));
                    }
                    else {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '%'));
                    }
                    break;
                case '=':
                    this.advance();
                    if (this.match('=')) {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '=='));
                    }
                    else {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '='));
                    }
                    break;
                case '!':
                    this.advance();
                    if (this.match('=')) {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '!='));
                    }
                    else {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '!'));
                    }
                    break;
                case '<':
                    this.advance();
                    if (this.match('=')) {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '<='));
                    }
                    else {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '<'));
                    }
                    break;
                case '>':
                    this.advance();
                    if (this.match('=')) {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '>='));
                    }
                    else {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '>'));
                    }
                    break;
                case '&':
                    this.advance();
                    if (this.match('&')) {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '&&'));
                    }
                    else {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '&'));
                    }
                    break;
                case '|':
                    this.advance();
                    if (this.match('|')) {
                        this.tokens.push(this.makeToken(TokenType.OPERATOR, '||'));
                    }
                    else {
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
    skipWhitespace() {
        while (this.isWhitespace(this.peek())) {
            this.advance();
        }
    }
    skipComments() {
        if (this.peek() === '/' && this.peekNext() === '/') {
            while (this.peek() !== '\n' && this.position < this.source.length) {
                this.advance();
            }
        }
        else if (this.peek() === '/' && this.peekNext() === '*') {
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
    readString(quote) {
        const startLine = this.line;
        const startColumn = this.column;
        let value = '';
        this.advance(); // opening quote
        while (this.peek() !== quote && this.position < this.source.length) {
            if (this.peek() === '\\') {
                this.advance();
                const escaped = this.readEscapeSequence();
                value += escaped;
            }
            else {
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
    readEscapeSequence() {
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
    readNumber() {
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
    readIdentifier() {
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
    makeToken(type, value) {
        return {
            type,
            value,
            line: this.line,
            column: this.column
        };
    }
    advance() {
        const char = this.source[this.position++];
        if (char === '\n') {
            this.line++;
            this.column = 1;
        }
        else {
            this.column++;
        }
        return char;
    }
    peek() {
        return this.source[this.position] || '';
    }
    peekNext() {
        return this.source[this.position + 1] || '';
    }
    match(expected) {
        if (this.peek() !== expected)
            return false;
        this.advance();
        return true;
    }
    isWhitespace(char) {
        return char === ' ' || char === '\t' || char === '\n' || char === '\r';
    }
    isDigit(char) {
        return char >= '0' && char <= '9';
    }
    isAlpha(char) {
        return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
    }
    isAlphaNumeric(char) {
        return this.isAlpha(char) || this.isDigit(char);
    }
}
/**
 * Constraint Parser - Builds AST from tokens
 */
export class ConstraintParser {
    constructor(tokens) {
        this.current = 0;
        this.tokens = tokens;
    }
    parse() {
        const program = {
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
    parseDeclaration() {
        if (this.match(TokenType.KEYWORD, 'constraint')) {
            return this.parseConstraintDeclaration();
        }
        if (this.match(TokenType.KEYWORD, 'fn')) {
            return this.parseFunctionDeclaration();
        }
        return this.parseStatement();
    }
    parseConstraintDeclaration() {
        const name = this.consume(TokenType.IDENTIFIER, 'Expected constraint name');
        const params = this.parseParameters();
        let priority;
        let domain;
        // Parse optional modifiers
        while (this.check(TokenType.KEYWORD)) {
            if (this.checkNext('priority')) {
                this.advance();
                this.consume(TokenType.COLON, 'Expected colon after priority');
                priority = this.parseNumber();
            }
            else if (this.checkNext('domain')) {
                this.advance();
                this.consume(TokenType.COLON, 'Expected colon after domain');
                domain = this.parseDomainType();
            }
            else {
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
    parseFunctionDeclaration() {
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
    parseParameters() {
        const params = [];
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
    parseParameter() {
        const name = this.consume(TokenType.IDENTIFIER, 'Expected parameter name');
        let typeAnnotation;
        if (this.match(TokenType.COLON)) {
            typeAnnotation = this.parseTypeAnnotation();
        }
        let defaultValue;
        if (this.match(TokenType.OPERATOR, '=')) {
            defaultValue = this.parseExpression();
        }
        return { name, typeAnnotation, defaultValue };
    }
    parseTypeAnnotation() {
        const typeName = this.consume(TokenType.IDENTIFIER, 'Expected type name');
        let typeParameters;
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
    parseDomainType() {
        const token = this.consume(TokenType.IDENTIFIER, 'Expected domain type');
        const validDomains = ['point', 'edge', 'face', 'face_corner', 'spline', 'instance'];
        if (!validDomains.includes(token.name)) {
            throw new Error(`Invalid domain type '${token.name}' at line ${token.line}`);
        }
        return token.name;
    }
    parseBlock() {
        this.consume(TokenType.LBRACE, 'Expected {');
        const statements = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            statements.push(this.parseStatement());
        }
        this.consume(TokenType.RBRACE, 'Expected }');
        return {
            type: ASTNodeType.BLOCK_STATEMENT,
            body: statements
        };
    }
    parseStatement() {
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
    parseReturnStatement() {
        const keyword = this.previous();
        let argument = null;
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
    parseIfStatement() {
        const keyword = this.previous();
        this.consume(TokenType.LPAREN, 'Expected (');
        const test = this.parseExpression();
        this.consume(TokenType.RPAREN, 'Expected )');
        const consequent = this.parseBlock();
        let alternate;
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
    parseForStatement() {
        const keyword = this.previous();
        this.consume(TokenType.LPAREN, 'Expected (');
        let init = null;
        if (!this.check(TokenType.SEMICOLON)) {
            if (this.check(TokenType.KEYWORD, 'let') || this.check(TokenType.KEYWORD, 'const')) {
                init = this.parseVariableDeclaration();
            }
            else {
                init = this.parseExpression();
            }
        }
        this.consume(TokenType.SEMICOLON, 'Expected ;');
        let test = null;
        if (!this.check(TokenType.SEMICOLON)) {
            test = this.parseExpression();
        }
        this.consume(TokenType.SEMICOLON, 'Expected ;');
        let update = null;
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
    parseVariableDeclaration() {
        const keyword = this.previous();
        const kind = keyword.value;
        const declarations = [];
        do {
            const id = this.consume(TokenType.IDENTIFIER, 'Expected variable name');
            let init;
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
    parseExpressionStatement() {
        const expression = this.parseExpression();
        this.consumeSemicolon();
        return {
            type: ASTNodeType.EXPRESSION_STATEMENT,
            expression
        };
    }
    parseExpression() {
        return this.parseAssignment();
    }
    parseAssignment() {
        const expr = this.parseLogicalOr();
        if (this.match(TokenType.OPERATOR, '=', '+=', '-=', '*=', '/=', '%=')) {
            const operator = this.previous().value;
            const right = this.parseAssignment();
            return {
                type: 'AssignmentExpression',
                operator: operator,
                left: expr,
                right
            };
        }
        return expr;
    }
    parseLogicalOr() {
        let expr = this.parseLogicalAnd();
        while (this.match(TokenType.OPERATOR, '||')) {
            const operator = this.previous().value;
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
    parseLogicalAnd() {
        let expr = this.parseEquality();
        while (this.match(TokenType.OPERATOR, '&&')) {
            const operator = this.previous().value;
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
    parseEquality() {
        let expr = this.parseComparison();
        while (this.match(TokenType.OPERATOR, '==', '!=', '===', '!==')) {
            const operator = this.previous().value;
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
    parseComparison() {
        let expr = this.parseAdditive();
        while (this.match(TokenType.OPERATOR, '<', '>', '<=', '>=')) {
            const operator = this.previous().value;
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
    parseAdditive() {
        let expr = this.parseMultiplicative();
        while (this.match(TokenType.OPERATOR, '+', '-')) {
            const operator = this.previous().value;
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
    parseMultiplicative() {
        let expr = this.parseUnary();
        while (this.match(TokenType.OPERATOR, '*', '/', '%')) {
            const operator = this.previous().value;
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
    parseUnary() {
        if (this.match(TokenType.OPERATOR, '!', '-', '+', '~')) {
            const operator = this.previous().value;
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
    parseCall() {
        let expr = this.parsePrimary();
        while (true) {
            if (this.match(TokenType.LPAREN)) {
                expr = this.finishCall(expr);
            }
            else if (this.match(TokenType.LBRACKET)) {
                const property = this.parseExpression();
                this.consume(TokenType.RBRACKET, 'Expected ]');
                expr = {
                    type: ASTNodeType.MEMBER_EXPRESSION,
                    object: expr,
                    property,
                    computed: true
                };
            }
            else if (this.match(TokenType.DOT)) {
                const property = this.consume(TokenType.IDENTIFIER, 'Expected property name');
                expr = {
                    type: ASTNodeType.MEMBER_EXPRESSION,
                    object: expr,
                    property,
                    computed: false
                };
            }
            else {
                break;
            }
        }
        return expr;
    }
    finishCall(callee) {
        const args = [];
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
    parsePrimary() {
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
                value: this.previous().value
            };
        }
        if (this.match(TokenType.STRING)) {
            return {
                type: ASTNodeType.LITERAL,
                value: this.previous().value
            };
        }
        if (this.match(TokenType.IDENTIFIER)) {
            return {
                type: ASTNodeType.IDENTIFIER,
                name: this.previous().value
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
    parseArrayLiteral() {
        const elements = [];
        while (!this.check(TokenType.RBRACKET)) {
            if (this.match(TokenType.COMMA)) {
                elements.push(null);
            }
            else {
                elements.push(this.parseExpression());
                if (!this.match(TokenType.COMMA))
                    break;
            }
        }
        this.consume(TokenType.RBRACKET, 'Expected ]');
        return {
            type: ASTNodeType.ARRAY_LITERAL,
            elements
        };
    }
    parseObjectLiteral() {
        const properties = [];
        while (!this.check(TokenType.RBRACE)) {
            const key = this.consume(TokenType.IDENTIFIER, 'Expected property name');
            let value;
            if (this.match(TokenType.COLON)) {
                value = this.parseExpression();
            }
            else {
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
                shorthand: key.name === value.name,
                computed: false
            });
            if (!this.match(TokenType.COMMA))
                break;
        }
        this.consume(TokenType.RBRACE, 'Expected }');
        return {
            type: ASTNodeType.OBJECT_LITERAL,
            properties
        };
    }
    parseNumber() {
        const token = this.consume(TokenType.NUMBER, 'Expected number');
        return token.value;
    }
    // Helper methods
    consume(type, message) {
        if (this.check(type))
            return this.advance();
        throw new Error(`${message} at line ${this.peek().line}, column ${this.peek().column}`);
    }
    consumeSemicolon() {
        if (this.match(TokenType.SEMICOLON))
            return;
        // Allow ASI (Automatic Semicolon Insertion)
        if (this.check(TokenType.RBRACE) || this.check(TokenType.RPAREN) || this.isAtEnd())
            return;
        throw new Error(`Expected ';' at line ${this.peek().line}, column ${this.peek().column}`);
    }
    match(...types) {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }
    check(type) {
        return this.peek().type === type;
    }
    checkNext(value) {
        return this.peekNext().value === value;
    }
    peek() {
        return this.tokens[this.current];
    }
    peekNext() {
        return this.tokens[this.current + 1];
    }
    previous() {
        return this.tokens[this.current - 1];
    }
    advance() {
        if (!this.isAtEnd())
            this.current++;
        return this.previous();
    }
    isAtEnd() {
        return this.peek().type === TokenType.EOF;
    }
}
/**
 * Parse constraint language source code into AST
 */
export function parseConstraintSource(source) {
    const lexer = new ConstraintLexer(source);
    const tokens = lexer.tokenize();
    const parser = new ConstraintParser(tokens);
    return parser.parse();
}
/**
 * Compile constraint source to executable function
 */
export function compileConstraint(source, context = {}) {
    const ast = parseConstraintSource(source);
    // TODO: Implement code generator and evaluator
    // This will be connected to the constraint solver system
    return function evaluate(...args) {
        // Placeholder implementation
        console.log('Constraint evaluation not yet implemented');
        return true;
    };
}
//# sourceMappingURL=ConstraintDSL.js.map