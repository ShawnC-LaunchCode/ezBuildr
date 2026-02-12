import 'dotenv/config';
import { sendEmail } from '../server/services/sendgrid';

async function main() {
    console.log('Testing SendGrid Service Integration...');

    const fromEmail = process.env.SENDGRID_FROM_EMAIL;

    console.log('Sending from:', fromEmail);
    console.log('Sending to: scooter4356@gmail.com');

    const result = await sendEmail({
        to: 'scooter4356@gmail.com',
        from: fromEmail ?? '', // Service handles undefined but typescript wants string
        subject: 'Final Test: ezBuildr Service Integration',
        text: 'This email confirms that the ezBuildr EmailService is correctly configured and working.',
        html: '<div style="font-family: sans-serif;"><h2>✅ Integration Successful</h2><p>This email confirms that the <strong>ezBuildr EmailService</strong> is correctly configured and working.</p></div>',
    });

    if (result.success) {
        console.log('✅ Service returned success!');
    } else {
        console.error('❌ Service returned error:', result.error);
        process.exit(1);
    }
}

main().catch(console.error);
