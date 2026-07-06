import { config } from 'dotenv';
config({ override: true });
import { initializeDatabase } from './server/db';
import { userRepository } from './server/repositories/UserRepository';
import { authService } from './server/services/AuthService';

async function run() {
    await initializeDatabase();
    
    const email = 'scooter4356@gmail.com';
    const existingUser = await userRepository.findByEmail(email);
    
    if (existingUser) {
        console.log(`User ${email} already exists. Updating role to admin...`);
        await userRepository.updateRole(existingUser.id, 'admin');
        console.log("Role updated successfully.");
    } else {
        console.log(`User ${email} does not exist. Creating and sending invite...`);
        const { v4: uuidv4 } = await import('uuid');
        const userId = uuidv4();
        
        await userRepository.create({
            id: userId,
            email,
            placeholderEmail: email,
            isPlaceholder: true,
            role: 'admin',
            authProvider: 'local',
            defaultMode: 'easy',
        });

        const crypto = await import('crypto');
        const dummyPassword = crypto.randomBytes(32).toString('hex');
        const passwordHash = await authService.hashPassword(dummyPassword);
        const { userCredentialsRepository } = await import('./server/repositories');
        await userCredentialsRepository.createCredentials(userId, passwordHash);

        await authService.generateSystemInviteToken(email, 'admin');
        console.log("User created and invite generated successfully.");
        
        console.log("Forcing email queue to send the invite now...");
        const { emailQueueService } = await import('./server/services/EmailQueueService');
        await (emailQueueService as any).processQueue();
        console.log("Invite sent!");
    }
    process.exit(0);
}
run().catch(console.error);
