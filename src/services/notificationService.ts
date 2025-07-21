import { supabase } from '@/integrations/supabase/client';
import emailjs from '@emailjs/browser';

// EmailJS configuration
const EMAILJS_SERVICE_ID = 'service_3ux4e79';
const EMAILJS_TEMPLATE_ID = 'template_po1yqoo';
const EMAILJS_PUBLIC_KEY = 'iqrbya988WpE1wUcR';

interface NotificationResult {
  success: boolean;
  emailsSent: number;
  smsSent: number;
  total: number;
  resultsPublished: number;
  studentsNotified: number;
  successDetails?: any[];
  failureDetails?: any[];
  errors: string[];
  message?: string;
}

interface StudentResult {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  student_id: string;
  cgpa: number | null;
  results: Array<{
    course_code: string;
    course_title: string;
    ca_score: number | null;
    exam_score: number | null;
    total_score: number | null;
    grade: string | null;
    grade_point: number | null;
    credit_units: number;
    academic_year: string;
    semester: string;
  }>;
}

export class NotificationService {
  private static readonly SMS_SERVICE_URL = process.env.NODE_ENV === 'production' 
    ? 'https://result-notification-three.vercel.app/' 
    : 'http://localhost:3001';

  // Initialize EmailJS (call this once in your app)
  static initEmailJS() {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }

  // Main method to publish results and send notifications
  static async publishAndNotifyResults(): Promise<NotificationResult> {
    try {
      console.log('📢 Publishing results and sending notifications...');
      
      // Get all results (both pending and published) for notification
      const { data: results, error: resultsError } = await supabase
        .from('results')
        .select(`
          *,
          students!inner(id, first_name, last_name, email, student_id, cgpa),
          courses!inner(course_title, course_code, credit_units)
        `)
        .in('status', ['pending', 'published'])
        .not('students.email', 'is', null); // Ensure students have email addresses

      if (resultsError) {
        throw new Error(`Failed to fetch results: ${resultsError.message}`);
      }

      if (!results || results.length === 0) {
        console.log('No results found for notification');
        return this.createEmptyResult();
      }

      // Filter out students with invalid email addresses
      const validResults = results.filter(result => 
        result.students?.email && 
        this.isValidEmail(result.students.email)
      );

      if (validResults.length === 0) {
        return {
          ...this.createEmptyResult(),
          errors: ['No students with valid email addresses found']
        };
      }

      // Separate pending and published results
      const pendingResults = validResults.filter(r => r.status === 'pending');
      const publishedResults = validResults.filter(r => r.status === 'published');

      console.log(`Found ${pendingResults.length} pending and ${publishedResults.length} published results`);

      // Update pending results to published
      let publishedCount = 0;
      if (pendingResults.length > 0) {
        const pendingIds = pendingResults.map(r => r.id);
        const { error: updateError } = await supabase
          .from('results')
          .update({ 
            status: 'published',
            published_at: new Date().toISOString()
          })
          .in('id', pendingIds);

        if (updateError) {
          throw new Error(`Failed to update results status: ${updateError.message}`);
        }
        publishedCount = pendingIds.length;
        console.log(`Published ${publishedCount} results`);
      }

      // Group results by student
      const studentResults = this.groupResultsByStudent(validResults);
      
      // Send detailed notifications
      const notificationResults = await this.sendDetailedNotifications(studentResults);

      // Store notification records
      await this.storeNotifications(studentResults.map(sr => sr), notificationResults.errors);

      return {
        success: true,
        resultsPublished: publishedCount,
        studentsNotified: studentResults.length,
        emailsSent: notificationResults.emailsSent,
        smsSent: notificationResults.smsSent,
        total: studentResults.length,
        successDetails: notificationResults.successDetails,
        failureDetails: notificationResults.failureDetails,
        errors: notificationResults.errors,
        message: `Processed ${results.length} results, notified ${studentResults.length} students`
      };

    } catch (error) {
      console.error('❌ Notification service error:', error);
      return this.createErrorResult(error);
    }
  }

  // Send custom notifications to selected students
  static async sendCustomNotification(
    studentIds: string[], 
    title: string, 
    message: string
  ): Promise<NotificationResult> {
    try {
      console.log(`📱 Sending custom notifications to ${studentIds.length} students`);
      
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .in('id', studentIds)
        .eq('status', 'Active')
        .not('email', 'is', null);

      if (studentsError) {
        throw new Error(`Failed to fetch students: ${studentsError.message}`);
      }

      if (!students || students.length === 0) {
        return {
          ...this.createEmptyResult(),
          errors: ['No active students with email addresses found']
        };
      }

      // Filter students with valid email addresses
      const validStudents = students.filter(student => 
        student.email && this.isValidEmail(student.email)
      );

      if (validStudents.length === 0) {
        return {
          ...this.createEmptyResult(),
          errors: ['No students with valid email addresses found']
        };
      }

      // Send notifications
      const notificationResults = await this.sendNotifications(validStudents, title, message);

      // Store custom notifications
      await this.storeCustomNotifications(validStudents, title, message, notificationResults.errors);

      return {
        success: true,
        resultsPublished: 0,
        studentsNotified: validStudents.length,
        emailsSent: notificationResults.emailsSent,
        smsSent: notificationResults.smsSent,
        total: validStudents.length,
        successDetails: notificationResults.successDetails,
        failureDetails: notificationResults.failureDetails,
        errors: notificationResults.errors
      };

    } catch (error) {
      console.error('❌ Custom notification error:', error);
      return this.createErrorResult(error);
    }
  }

  // Test email functionality
  static async testEmail(email: string, studentName: string): Promise<boolean> {
    try {
      if (!this.isValidEmail(email)) {
        console.error('❌ Invalid email format:', email);
        return false;
      }

      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          to_name: studentName,
          to_email: email,
          student_id: 'TEST123',
          message: 'This is a test email from EduNotify system.',
          institution: 'Moshood Abiola Polytechnic',
          subject: 'Test Email - EduNotify System'
        },
        EMAILJS_PUBLIC_KEY
      );

      console.log('✅ Test email sent successfully to:', email);
      return true;
    } catch (error) {
      console.error('❌ Test email error:', error);
      return false;
    }
  }

  // Test SMS functionality
  static async testSMS(phoneNumber: string, message: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.SMS_SERVICE_URL}/api/test-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, message })
      });

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('❌ Test SMS error:', error);
      return false;
    }
  }

  // Get notification history
  static async getNotificationHistory(limit: number = 50) {
    try {
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select(`
          *,
          students(first_name, last_name, student_id, email)
        `)
        .order('sent_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return notifications || [];
    } catch (error) {
      console.error('❌ Error fetching notifications:', error);
      return [];
    }
  }

  // Check if SMS service is running
  static async checkSMSServiceHealth(): Promise<boolean> {
    try {
      console.log('🔍 Checking SMS service health...');
      const response = await fetch(`${this.SMS_SERVICE_URL}/api/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors',
        credentials: 'include'
      });
      
      if (response.ok) {
        const health = await response.json();
        console.log('✅ SMS service is healthy:', health);
        return true;
      } else {
        console.warn('⚠️ SMS service health check failed:', response.status);
        return false;
      }
    } catch (error) {
      console.error('❌ SMS service health check failed:', error);
      return false;
    }
  }

  // Validate email format
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Alias for backward compatibility
  static async sendResultNotifications(): Promise<NotificationResult> {
    return this.publishAndNotifyResults();
  }

  // Private helper methods
  private static groupResultsByStudent(results: any[]): StudentResult[] {
    const studentMap = new Map<string, StudentResult>();

    results.forEach(result => {
      const student = result.students;
      const course = result.courses;

      if (!studentMap.has(student.id)) {
        studentMap.set(student.id, {
          id: student.id,
          first_name: student.first_name,
          last_name: student.last_name,
          email: student.email,
          student_id: student.student_id,
          cgpa: student.cgpa,
          results: []
        });
      }

      studentMap.get(student.id)!.results.push({
        course_code: course.course_code,
        course_title: course.course_title,
        ca_score: result.ca_score,
        exam_score: result.exam_score,
        total_score: result.total_score,
        grade: result.grade,
        grade_point: result.grade_point,
        credit_units: course.credit_units,
        academic_year: result.academic_year,
        semester: result.semester
      });
    });

    return Array.from(studentMap.values());
  }

private static formatDetailedEmailMessage(student: StudentResult): string {
  const fullName = `${student.first_name} ${student.last_name}`;
  const cgpa = student.cgpa ? student.cgpa.toFixed(2) : 'N/A';

  // Group results by academic year and semester
  const groupedResults = new Map<string, any[]>();

  student.results.forEach(result => {
    const key = `${result.academic_year} - ${result.semester}`;
    if (!groupedResults.has(key)) {
      groupedResults.set(key, []);
    }
    groupedResults.get(key)!.push(result);
  });

  let courseResultsHTML = '';

  for (const [period, results] of groupedResults) {
    courseResultsHTML += `<div class="period-header">${period}</div>`;
    courseResultsHTML += `<table class="results-table">
      <thead>
        <tr>
          <th>Course Code</th>
          <th>Course Title</th>
          <th>CA Score</th>
          <th>Exam Score</th>
          <th>Total Score</th>
          <th>Grade</th>
          <th>Grade Point</th>
          <th>Credit Units</th>
        </tr>
      </thead>
      <tbody>`;

    results.forEach(result => {
      courseResultsHTML += `<tr>
        <td class="course-code">${result.course_code}</td>
        <td>${result.course_title}</td>
        <td>${result.ca_score || 'N/A'}</td>
        <td>${result.exam_score || 'N/A'}</td>
        <td class="total-score">${result.total_score || 'N/A'}</td>
        <td class="grade">${result.grade || 'N/A'}</td>
        <td>${result.grade_point || 'N/A'}</td>
        <td>${result.credit_units}</td>
      </tr>`;
    });

    courseResultsHTML += `</tbody>
    </table>`;
  } const emailTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Academic Results Published - Moshood Abiola Polytechnic</title>
        <style>
            body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
                background-color: #f4f4f4;
                line-height: 1.6;
            }
            .email-container {
                max-width: 800px;
                margin: 0 auto;
                background-color: #ffffff;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
                background-color: #2c3e50;
                color: white;
                padding: 20px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
            }
            .header p {
                margin: 10px 0 0 0;
                font-size: 16px;
            }
            .content {
                padding: 30px;
            }
            .greeting {
                font-size: 16px;
                color: #2c3e50;
                margin-bottom: 30px;
            }
            .intro-text {
                font-size: 14px;
                line-height: 1.6;
                color: #34495e;
                margin-bottom: 30px;
            }
            .student-info {
                background-color: #ecf0f1;
                padding: 20px;
                border-radius: 5px;
                margin-bottom: 30px;
            }
            .student-info h2 {
                color: #2c3e50;
                margin-top: 0;
                margin-bottom: 20px;
                font-size: 20px;
            }
            .info-table {
                width: 100%;
                border-collapse: collapse;
            }
            .info-table td {
                padding: 8px 0;
                vertical-align: top;
            }
            .info-table td:first-child {
                font-weight: bold;
                color: #2c3e50;
                width: 150px;
            }
            .info-table td:last-child {
                color: #34495e;
            }
            .cgpa-value {
                font-weight: bold;
                font-size: 16px;
            }
            .results-section h2 {
                color: #2c3e50;
                margin-bottom: 20px;
                font-size: 20px;
            }
            .period-header {
                color: #2c3e50;
                margin-top: 30px;
                margin-bottom: 15px;
                font-size: 18px;
            }
            .results-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
                font-family: Arial, sans-serif;
            }
            .results-table thead th {
                background-color: #3498db;
                color: white;
                border: 1px solid #ddd;
                padding: 12px;
                text-align: left;
                font-weight: bold;
            }
            .results-table tbody td {
                border: 1px solid #ddd;
                padding: 10px;
            }
            .results-table tbody tr:nth-child(even) {
                background-color: #f9f9f9;
            }
            .results-table tbody tr:nth-child(odd) {
                background-color: white;
            }
            .course-code {
                font-weight: bold;
                color: #2c3e50;
            }
            .total-score, .grade {
                font-weight: bold;
            }
            .grade {
                color: #e74c3c;
            }
            .text-center {
                text-align: center;
            }
            .next-steps {
                background-color: #e8f6f3;
                padding: 20px;
                border-radius: 5px;
                margin-top: 30px;
            }
            .next-steps h3 {
                color: #27ae60;
                margin-top: 0;
                margin-bottom: 15px;
            }
            .next-steps ul {
                color: #2c3e50;
                line-height: 1.6;
                margin: 0;
                padding-left: 20px;
            }
            .contact-info {
                background-color: #fff3cd;
                padding: 20px;
                border-radius: 5px;
                margin-top: 20px;
            }
            .contact-info h3 {
                color: #856404;
                margin-top: 0;
                margin-bottom: 15px;
            }
            .contact-info table {
                width: 100%;
                color: #856404;
            }
            .contact-info td {
                padding: 5px 0;
                vertical-align: top;
            }
            .contact-info td:first-child {
                font-weight: bold;
                width: 180px;
            }
            .signature {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 2px solid #ecf0f1;
                text-align: center;
                color: #7f8c8d;
            }
            .signature p {
                margin: 5px 0;
            }
            .signature .department {
                font-weight: bold;
                color: #2c3e50;
            }
            .footer {
                background-color: #34495e;
                color: #bdc3c7;
                padding: 15px;
                text-align: center;
                font-size: 12px;
            }
            .footer p {
                margin: 5px 0;
            }
            .footer .email-address {
                font-weight: bold;
            }
            @media only screen and (max-width: 600px) {
                .email-container {
                    margin: 0;
                    box-shadow: none;
                }
                .content {
                    padding: 20px;
                }
                .results-table {
                    font-size: 12px;
                }
                .results-table th,
                .results-table td {
                    padding: 6px;
                }
                .info-table td:first-child {
                    width: 120px;
                }
                .contact-info td:first-child {
                    width: 120px;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="header">
                <h1>Academic Results Published - Moshood Abiola Polytechnic</h1>
                <p>Moshood Abiola Polytechnic</p>
            </div>
            <div class="content">
                <p class="greeting">Dear ${fullName},</p>
                <p class="intro-text">
                    We are pleased to inform you that your academic results have been published and are now available for your review.
                </p>
                <div class="student-info">
                    <h2>Student Information</h2>
                    <table class="info-table">
                        <tr>
                            <td>Student ID:</td>
                            <td>${student.student_id}</td>
                        </tr>
                        <tr>
                            <td>Email:</td>
                            <td>${student.email}</td>
                        </tr>
                        <tr>
                            <td>Current CGPA:</td>
                            <td class="cgpa-value">${cgpa}</td>
                        </tr>
                    </table>
                </div>
                <div class="results-section">
                    <h2>Academic Results</h2>
                    ${courseResultsHTML}
                </div>
                <div class="next-steps">
                    <h3>Next Steps:</h3>
                    <ul>
                        <li>Log in to your EduNotify student portal for detailed information</li>
                        <li>Download your official transcript if needed</li>
                        <li>Contact the Academic Affairs Office if you have any questions</li>
                    </ul>
                </div>
                
            </div>
            <div class="footer">
                <p>This message was sent to <span class="email-address">${student.email}</span></p>
                <p>Sent on ${new Date().toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</p>
                <p>This is an official communication from Moshood Abiola Polytechnic.</p>
                <p>Please add academic.affairs@edunotify to your contacts to ensure delivery.</p>
            </div>
        </div>
    </body>
    </html>
  `;

  return emailTemplate;
}

  private static async sendDetailedNotifications(
    studentResults: StudentResult[]
  ): Promise<{
    emailsSent: number;
    smsSent: number;
    successDetails: any[];
    failureDetails: any[];
    errors: string[];
  }> {
    let emailsSent = 0;
    let smsSent = 0;
    const successDetails: any[] = [];
    const failureDetails: any[] = [];
    const errors: string[] = [];

    console.log(`📧 Sending detailed email notifications to ${studentResults.length} students...`);

    // Send detailed email notifications with retry logic
    for (const student of studentResults) {
      const maxRetries = 3;
      let retryCount = 0;
      let emailSent = false;

      while (retryCount < maxRetries && !emailSent) {
        try {
          const detailedMessage = this.formatDetailedEmailMessage(student);
          
          console.log(`📧 Attempting to send email to ${student.email} (${student.first_name} ${student.last_name}), attempt ${retryCount + 1}`);
          
          const response = await emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID,
            {
              to_name: `${student.first_name} ${student.last_name}`,
              to_email: student.email,
              student_id: student.student_id,
              message: detailedMessage,
              institution: 'Moshood Abiola Polytechnic',
              subject: 'Academic Results Published - Moshood Abiola Polytechnic',
              from_name: 'Academic Affairs Department',
              from_email: 'academic.affairs@edunotify',
              reply_to: 'academic.affairs@edunotify'
            },
            EMAILJS_PUBLIC_KEY
          );
          
          emailsSent++;
          emailSent = true;
          successDetails.push({
            type: 'email',
            student: `${student.first_name} ${student.last_name}`,
            contact: student.email,
            student_id: student.student_id
          });
          console.log(`✅ Email successfully sent to ${student.email}`);
          
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (emailError: any) {
          retryCount++;
          console.error(`❌ Email attempt ${retryCount} failed for ${student.email}:`, emailError);
          
          if (retryCount >= maxRetries) {
            const errorMsg = `Email failed for ${student.first_name} ${student.last_name} (${student.email}) after ${maxRetries} attempts`;
            console.error(`❌ ${errorMsg}`);
            errors.push(errorMsg);
            failureDetails.push({
              type: 'email',
              student: `${student.first_name} ${student.last_name}`,
              contact: student.email,
              student_id: student.student_id,
              error: emailError.message || 'Unknown error',
              attempts: maxRetries
            });
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
        }
      }
    }

    // Send SMS notifications if service is available
    const isSMSHealthy = await this.checkSMSServiceHealth();
    if (isSMSHealthy) {
      try {
        console.log(`📱 Sending SMS notifications to ${studentResults.length} students...`);
        
        const response = await fetch(`${this.SMS_SERVICE_URL}/api/notify-results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            studentIds: studentResults.map(s => s.id), 
            title: 'Results Published', 
            message: 'Your exam results have been published! Check your email for details or log in to EduNotify to view your results.' 
          })
        });

        if (response.ok) {
          const smsResult = await response.json();
          smsSent = smsResult.smsSent || 0;
          if (smsResult.successDetails) successDetails.push(...smsResult.successDetails);
          if (smsResult.failureDetails) failureDetails.push(...smsResult.failureDetails);
          console.log(`✅ SMS sent to ${smsSent} students`);
        } else {
          console.error('❌ SMS service request failed:', response.status);
          errors.push('SMS service request failed');
        }
      } catch (smsError) {
        console.error('❌ SMS service error:', smsError);
        errors.push('SMS service unavailable');
      }
    } else {
      console.warn('⚠️ SMS service not available, skipping SMS notifications');
    }

    return { emailsSent, smsSent, successDetails, failureDetails, errors };
  }

  private static async sendNotifications(
    students: any[], 
    customTitle?: string, 
    customMessage?: string
  ): Promise<{
    emailsSent: number;
    smsSent: number;
    successDetails: any[];
    failureDetails: any[];
    errors: string[];
  }> {
    let emailsSent = 0;
    let smsSent = 0;
    const successDetails: any[] = [];
    const failureDetails: any[] = [];
    const errors: string[] = [];

    const title = customTitle || 'Results Published';
    const message = customMessage || 'Your latest exam results have been published! Log in to EduNotify to view your results.';

    console.log(`📧 Sending custom email notifications to ${students.length} students...`);

    // Send email notifications
    for (const student of students) {
      try {
        console.log(`📧 Sending email to ${student.email} (${student.first_name} ${student.last_name})`);
        
        await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          {
            to_name: `${student.first_name} ${student.last_name}`,
            to_email: student.email,
            student_id: student.student_id,
            message: message,
            institution: 'Moshood Abiola Polytechnic',
            subject: title,
            from_name: 'academic.affairs@edunotify',
            from_email: 'academic.affairs@edunotify',
            reply_to: 'academic.affairs@edunotify'
          },
          EMAILJS_PUBLIC_KEY
        );
        
        emailsSent++;
        successDetails.push({
          type: 'email',
          student: `${student.first_name} ${student.last_name}`,
          contact: student.email,
          student_id: student.student_id
        });
        console.log(`✅ Email sent to ${student.email}`);
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (emailError: any) {
        const errorMsg = `Email failed for ${student.first_name} ${student.last_name} (${student.email})`;
        console.error(`❌ ${errorMsg}:`, emailError);
        errors.push(errorMsg);
        failureDetails.push({
          type: 'email',
          student: `${student.first_name} ${student.last_name}`,
          contact: student.email,
          student_id: student.student_id,
          error: emailError.message || 'Unknown error'
        });
      }
    }

    // Send SMS notifications if service is available
    const isSMSHealthy = await this.checkSMSServiceHealth();
    if (isSMSHealthy) {
      try {
        const response = await fetch(`${this.SMS_SERVICE_URL}/api/notify-results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            studentIds: students.map(s => s.id), 
            title, 
            message 
          })
        });

        if (response.ok) {
          const smsResult = await response.json();
          smsSent = smsResult.smsSent || 0;
          if (smsResult.successDetails) successDetails.push(...smsResult.successDetails);
          if (smsResult.failureDetails) failureDetails.push(...smsResult.failureDetails);
          console.log(`✅ SMS sent to ${smsSent} students`);
        } else {
          errors.push('SMS service request failed');
        }
      } catch (smsError) {
        console.error('❌ SMS service error:', smsError);
        errors.push('SMS service unavailable');
      }
    } else {
      console.warn('⚠️ SMS service not available, skipping SMS notifications');
    }

    return { emailsSent, smsSent, successDetails, failureDetails, errors };
  }

  private static async storeNotifications(students: any[], errors: string[]): Promise<void> {
    const notifications = students.map(student => ({
      student_id: student.id,
      title: 'Results Published',
      message: 'Your latest exam results have been published! Log in to view your results.',
      type: 'result_published',
      status: 'sent',
      sent_at: new Date().toISOString()
    }));

    const { error: notificationError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (notificationError) {
      console.error('❌ Failed to store notifications:', notificationError);
      errors.push('Failed to store notification records');
    }
  }

  private static async storeCustomNotifications(
    students: any[], 
    title: string, 
    message: string, 
    errors: string[]
  ): Promise<void> {
    const notifications = students.map(student => ({
      student_id: student.id,
      title: title,
      message: message,
      type: 'custom',
      status: 'sent',
      sent_at: new Date().toISOString()
    }));

    const { error: notificationError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (notificationError) {
      console.error('❌ Failed to store custom notifications:', notificationError);
      errors.push('Failed to store notification records');
    }
  }

  private static createEmptyResult(): NotificationResult {
    return {
      success: true,
      emailsSent: 0,
      smsSent: 0,
      total: 0,
      resultsPublished: 0,
      studentsNotified: 0,
      errors: []
    };
  }

  private static createErrorResult(error: unknown): NotificationResult {
    let errorMessage = 'Unknown error';
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      errorMessage = 'Cannot connect to SMS service. Please ensure the backend server is running on port 3001.';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      success: false,
      resultsPublished: 0,
      studentsNotified: 0,
      emailsSent: 0,
      smsSent: 0,
      total: 0,
      errors: [errorMessage]
    };
  }
}