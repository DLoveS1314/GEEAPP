---
name: code-comments
description: Generate standardized, maintainable, and engineering-style code comments for source code.
license: Apache-2.0
metadata:
  author: lsd
  version: 1.0.0
---

## Purpose

This skill standardizes code comments when generating, rewriting, or completing code.

The goal of comments is to improve readability, maintenance, onboarding efficiency, and interface understanding. Comments must explain responsibilities, constraints, assumptions, boundary conditions, and design intent, rather than mechanically repeating the code itself.

## Core Principles
0. Every function and property should have a comment; please add one if it doesn't.
1. Do not translate code line by line into comments.
2. Prefer explaining **why** and **under what conditions**, not only **what**.
3. Keep comment style consistent within the file and across the project.
4. Use comments only where they add engineering value.
5. Avoid redundant, vague, or outdated comments.
6. When code contains assumptions, boundary conditions, failure paths, coordinate semantics, or non-obvious business logic, comments are required.
7. Public APIs, core classes, key data structures, configuration items, and complex algorithmic logic must have standardized comments.
8. Unless the project already uses English comments consistently, default to **Chinese comments**.
9. Comments must stay aligned with the final code output.
10. Output final code with comments included directly in the code. Do not explain separately that comments were added.

## File-Level Comment Rules

For important source files, add a file header comment describing:

- file purpose
- core responsibility
- relationship to other modules
