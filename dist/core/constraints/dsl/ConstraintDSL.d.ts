/**
 * Constraint Language DSL for Infinigen R3F
 *
 * Implements a domain-specific language for defining procedural generation constraints.
 * Based on the original Infinigen constraint system from Princeton VL.
 *
 * @module constraints/dsl
 */
import type { ConstraintOperator, DomainType } from '../types';
/**
 * Token types for the constraint lexer
 */
export declare enum TokenType {
    IDENTIFIER = "IDENTIFIER",
    NUMBER = "NUMBER",
    STRING = "STRING",
    OPERATOR = "OPERATOR",
    LPAREN = "LPAREN",
    RPAREN = "RPAREN",
    LBRACE = "LBRACE",
    RBRACE = "RBRACE",
    LBRACKET = "LBRACKET",
    RBRACKET = "RBRACKET",
    COMMA = "COMMA",
    COLON = "COLON",
    ARROW = "ARROW",
    KEYWORD = "KEYWORD",
    EOF = "EOF"
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
export declare enum ASTNodeType {
    PROGRAM = "PROGRAM",
    CONSTRAINT_DECLARATION = "CONSTRAINT_DECLARATION",
    BINARY_EXPRESSION = "BINARY_EXPRESSION",
    UNARY_EXPRESSION = "UNARY_EXPRESSION",
    MEMBER_EXPRESSION = "MEMBER_EXPRESSION",
    CALL_EXPRESSION = "CALL_EXPRESSION",
    IDENTIFIER = "IDENTIFIER",
    LITERAL = "LITERAL",
    ARRAY_LITERAL = "ARRAY_LITERAL",
    OBJECT_LITERAL = "OBJECT_LITERAL",
    FUNCTION_DECLARATION = "FUNCTION_DECLARATION",
    BLOCK_STATEMENT = "BLOCK_STATEMENT",
    RETURN_STATEMENT = "RETURN_STATEMENT",
    IF_STATEMENT = "IF_STATEMENT",
    FOR_STATEMENT = "FOR_STATEMENT"
}
/**
 * Base AST Node
 */
export interface ASTNode {
    type: ASTNodeType;
    loc?: {
        start: {
            line: number;
            column: number;
        };
        end: {
            line: number;
            column: number;
        };
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
export type Statement = ReturnStatement | IfStatement | ForStatement | ExpressionStatement | VariableDeclaration;
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
export type Expression = BinaryExpression | UnaryExpression | MemberExpression | CallExpression | Identifier | Literal | ArrayLiteral | ObjectLiteral | FunctionExpression | ArrowFunction | ConditionalExpression | AssignmentExpression;
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
export declare class ConstraintLexer {
    private source;
    private position;
    private line;
    private column;
    private tokens;
    private keywords;
    constructor(source: string);
    tokenize(): Token[];
    private skipWhitespace;
    private skipComments;
    private readString;
    private readEscapeSequence;
    private readNumber;
    private readIdentifier;
    private makeToken;
    private advance;
    private peek;
    private peekNext;
    private match;
    private isWhitespace;
    private isDigit;
    private isAlpha;
    private isAlphaNumeric;
}
/**
 * Constraint Parser - Builds AST from tokens
 */
export declare class ConstraintParser {
    private tokens;
    private current;
    constructor(tokens: Token[]);
    parse(): Program;
    private parseDeclaration;
    private parseConstraintDeclaration;
    private parseFunctionDeclaration;
    private parseParameters;
    private parseParameter;
    private parseTypeAnnotation;
    private parseDomainType;
    private parseBlock;
    private parseStatement;
    private parseReturnStatement;
    private parseIfStatement;
    private parseForStatement;
    private parseVariableDeclaration;
    private parseExpressionStatement;
    private parseExpression;
    private parseAssignment;
    private parseLogicalOr;
    private parseLogicalAnd;
    private parseEquality;
    private parseComparison;
    private parseAdditive;
    private parseMultiplicative;
    private parseUnary;
    private parseCall;
    private finishCall;
    private parsePrimary;
    private parseArrayLiteral;
    private parseObjectLiteral;
    private parseNumber;
    private consume;
    private consumeSemicolon;
    private match;
    private check;
    private checkNext;
    private peek;
    private peekNext;
    private previous;
    private advance;
    private isAtEnd;
}
/**
 * Parse constraint language source code into AST
 */
export declare function parseConstraintSource(source: string): Program;
/**
 * Compile constraint source to executable function
 */
export declare function compileConstraint(source: string, context?: Record<string, any>): (...args: any[]) => any;
//# sourceMappingURL=ConstraintDSL.d.ts.map