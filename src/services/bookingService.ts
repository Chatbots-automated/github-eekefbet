import { db } from '../config/firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { Booking, TimeSlot, BookedTimeSlot } from '../types/booking';

const WEBHOOK_URLS = {
  'standing-1': 'https://hook.eu2.make.com/p2yjukhy5vs8xqfaq39j70vhrzbsbodl',
  'lying-1': 'https://hook.eu2.make.com/qj2cbsdad1hkswdrt3ckkct3p7bmjsfw',
  'lying-2': 'https://hook.eu2.make.com/dqapvqe5ipg9gupvi44pdoac4llfxv1v'
};

export const fetchAvailableTimeSlots = async (cabinId: string, date: string): Promise<TimeSlot[]> => {
  try {
    const webhookUrl = WEBHOOK_URLS[cabinId as keyof typeof WEBHOOK_URLS];
    if (!webhookUrl) {
      throw new Error('Invalid cabin ID');
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch time slots');
    }

    const data = await response.json();
    const bookedTimes: BookedTimeSlot[] = data.bookedTimes || [];

    // Generate all possible time slots for the day
    const timeSlots: TimeSlot[] = [];
    for (let hour = 9; hour < 21; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const isBooked = bookedTimes.some(slot => {
          const startTime = new Date(slot.start).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
          });
          const endTime = new Date(slot.end).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
          });
          return time >= startTime && time < endTime;
        });

        timeSlots.push({
          time,
          available: !isBooked
        });
      }
    }

    return timeSlots;
  } catch (error) {
    console.error('Error fetching time slots:', error);
    throw error;
  }
};

export const createBooking = async (bookingData: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>) => {
  try {
    const now = new Date().toISOString();

    const bookingRef = await addDoc(collection(db, 'bookings'), {
      ...bookingData,
      createdAt: now,
      updatedAt: now,
      status: 'confirmed',
    });

    const webhookUrl = WEBHOOK_URLS[bookingData.cabin as keyof typeof WEBHOOK_URLS];
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'new_booking',
          booking: {
            ...bookingData,
            id: bookingRef.id,
          },
        }),
      });
    }

    return bookingRef.id;
  } catch (error) {
    console.error('Error creating booking:', error);
    throw error;
  }
};

export const getUserBookings = async (userId: string) => {
  try {
    const bookingsQuery = query(
      collection(db, 'bookings'),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(bookingsQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    throw error;
  }
};

export const cancelBooking = async (bookingId: string, cabinId: string) => {
  try {
    const bookingRef = doc(db, 'bookings', bookingId);
    await updateDoc(bookingRef, {
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    });

    const webhookUrl = WEBHOOK_URLS[cabinId as keyof typeof WEBHOOK_URLS];
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'cancel_booking',
          bookingId,
        }),
      });
    }
  } catch (error) {
    console.error('Error canceling booking:', error);
    throw error;
  }
};