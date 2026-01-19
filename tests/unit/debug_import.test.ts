import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { registerAiRoutes } from '../../server/routes/ai.routes';
describe('Debug Test', () => {
    it('should find module', () => {
        expect(registerAiRoutes).toBeDefined();
    });
});